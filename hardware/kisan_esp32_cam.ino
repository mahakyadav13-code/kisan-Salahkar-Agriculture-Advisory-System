/*
 * ═══════════════════════════════════════════════════════════════════
 *  Kisan Salahkar — ESP32-CAM Leaf Disease Capture Firmware
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Hardware:
 *    - ESP32-CAM (AI-Thinker module with OV2640 camera)
 *    - 18650 Battery via battery holder → 5V pin
 *
 *  How it works:
 *    1. Press the RESET button (or GPIO 0 button) on ESP32-CAM
 *    2. Camera captures a JPEG image of the leaf
 *    3. Image is sent via WiFi to Flask /api/sensor/camera endpoint
 *    4. Flask returns disease diagnosis result
 *    5. Built-in LED (GPIO 4 flash) blinks to show result status
 *
 *  Wiring (ESP32-CAM is self-contained — camera is onboard):
 *    Battery (+) → 5V pin
 *    Battery (-) → GND pin
 *    GPIO 0 → Button → GND  (for triggering capture manually)
 *
 *  Upload Note:
 *    - ESP32-CAM has NO USB port — you need an FTDI adapter:
 *      FTDI TX  → ESP32-CAM U0R
 *      FTDI RX  → ESP32-CAM U0T
 *      FTDI GND → ESP32-CAM GND
 *      FTDI 5V  → ESP32-CAM 5V
 *    - Connect GPIO 0 to GND during upload, then disconnect after
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "Base64.h"

// ═══════════════════════════════════════════════════════════════
//  USER CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const char* WIFI_SSID     = "kushwah";
const char* WIFI_PASSWORD = "91708882";
const char* SERVER_URL    = "http://10.186.88.219:5000/api/sensor/camera";
const char* DEVICE_ID     = "ESP32-CAM-001";
const char* API_KEY       = "kisan-iot-2026";

// ═══════════════════════════════════════════════════════════════
//  ESP32-CAM Pin Definitions (AI-Thinker module)
//  DO NOT CHANGE — these are fixed for the AI-Thinker board
// ═══════════════════════════════════════════════════════════════

#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define FLASH_LED_PIN      4   // Onboard flash LED
#define TRIGGER_PIN       13   // Button to trigger capture (optional)

// ═══════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("═══════════════════════════════════════════");
    Serial.println("  📷 Kisan Salahkar — ESP32-CAM Node");
    Serial.println("═══════════════════════════════════════════");

    // Configure pins
    pinMode(FLASH_LED_PIN, OUTPUT);
    pinMode(TRIGGER_PIN, INPUT_PULLUP);
    digitalWrite(FLASH_LED_PIN, LOW);

    // Initialize camera
    initCamera();

    // Connect WiFi
    connectWiFi();

    Serial.println("[OK] Ready — press button or wait for auto-capture");
}

// ═══════════════════════════════════════════════════════════════
//  CAMERA INITIALIZATION
// ═══════════════════════════════════════════════════════════════

void initCamera() {
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer   = LEDC_TIMER_0;
    config.pin_d0       = Y2_GPIO_NUM;
    config.pin_d1       = Y3_GPIO_NUM;
    config.pin_d2       = Y4_GPIO_NUM;
    config.pin_d3       = Y5_GPIO_NUM;
    config.pin_d4       = Y6_GPIO_NUM;
    config.pin_d5       = Y7_GPIO_NUM;
    config.pin_d6       = Y8_GPIO_NUM;
    config.pin_d7       = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM;
    config.pin_pclk     = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM;
    config.pin_href     = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;
    config.pin_reset    = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;

    // Use PSRAM for larger frame buffer if available
    if (psramFound()) {
        config.frame_size   = FRAMESIZE_UXGA;  // 1600x1200
        config.jpeg_quality = 10;               // Lower = better quality (0-63)
        config.fb_count     = 2;
        Serial.println("[CAM] PSRAM found — using high resolution");
    } else {
        config.frame_size   = FRAMESIZE_VGA;    // 640x480
        config.jpeg_quality = 12;
        config.fb_count     = 1;
        Serial.println("[CAM] No PSRAM — using VGA resolution");
    }

    // Initialize camera
    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAM] Init FAILED: 0x%x\n", err);
        // Blink rapidly to indicate error
        while (true) {
            digitalWrite(FLASH_LED_PIN, HIGH);
            delay(200);
            digitalWrite(FLASH_LED_PIN, LOW);
            delay(200);
        }
    }

    // Adjust camera settings for leaf photography
    sensor_t *s = esp_camera_sensor_get();
    s->set_brightness(s, 1);     // Slightly brighter
    s->set_contrast(s, 1);       // Slightly more contrast
    s->set_saturation(s, 1);     // Slightly more saturation (greens pop)
    s->set_whitebal(s, 1);       // Auto white balance ON
    s->set_awb_gain(s, 1);       // Auto WB gain ON
    s->set_exposure_ctrl(s, 1);  // Auto exposure ON

    Serial.println("[CAM] Camera initialized successfully");
}

// ═══════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════════

void loop() {
    // Check if trigger button is pressed (active LOW with pull-up)
    if (digitalRead(TRIGGER_PIN) == LOW) {
        delay(50);  // Debounce
        if (digitalRead(TRIGGER_PIN) == LOW) {
            Serial.println("\n[TRIGGER] Button pressed — capturing leaf image...");
            captureAndSend();
            // Wait for button release
            while (digitalRead(TRIGGER_PIN) == LOW) delay(10);
        }
    }

    delay(100);
}

// ═══════════════════════════════════════════════════════════════
//  CAPTURE & SEND
// ═══════════════════════════════════════════════════════════════

void captureAndSend() {
    // Turn on flash LED for illumination
    digitalWrite(FLASH_LED_PIN, HIGH);
    delay(300);  // Let the LED stabilize and camera adjust exposure

    // Capture image
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[CAM] Capture failed!");
        digitalWrite(FLASH_LED_PIN, LOW);
        return;
    }

    Serial.printf("[CAM] Captured: %dx%d, %d bytes\n", fb->width, fb->height, fb->len);

    // Turn off flash
    digitalWrite(FLASH_LED_PIN, LOW);

    // Check WiFi
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WARN] No WiFi — reconnecting...");
        connectWiFi();
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[ERR] Cannot connect — image lost");
            esp_camera_fb_return(fb);
            return;
        }
    }

    // Send image to server as base64 in JSON
    sendImageToServer(fb);

    // Return frame buffer to free memory
    esp_camera_fb_return(fb);
}

void sendImageToServer(camera_fb_t *fb) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(30000);  // 30s timeout (image upload takes time)

    // Encode image to base64
    String imageBase64 = base64::encode(fb->buf, fb->len);

    // Build JSON
    String jsonPayload = "{";
    jsonPayload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
    jsonPayload += "\"api_key\":\"" + String(API_KEY) + "\",";
    jsonPayload += "\"image\":\"data:image/jpeg;base64," + imageBase64 + "\"";
    jsonPayload += "}";

    Serial.printf("[HTTP] Sending image (%d bytes base64)...\n", imageBase64.length());

    int httpCode = http.POST(jsonPayload);

    if (httpCode > 0) {
        String response = http.getString();
        Serial.printf("[HTTP] Response: %d — %s\n", httpCode, response.c_str());

        // Success blink pattern: 2 slow blinks
        for (int i = 0; i < 2; i++) {
            digitalWrite(FLASH_LED_PIN, HIGH);
            delay(500);
            digitalWrite(FLASH_LED_PIN, LOW);
            delay(500);
        }
    } else {
        Serial.printf("[HTTP] Error: %s\n", http.errorToString(httpCode).c_str());

        // Error blink pattern: 5 fast blinks
        for (int i = 0; i < 5; i++) {
            digitalWrite(FLASH_LED_PIN, HIGH);
            delay(100);
            digitalWrite(FLASH_LED_PIN, LOW);
            delay(100);
        }
    }

    http.end();
}

// ═══════════════════════════════════════════════════════════════
//  WIFI
// ═══════════════════════════════════════════════════════════════

void connectWiFi() {
    Serial.printf("[WiFi] Connecting to '%s'", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println(" Connected!");
        Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println(" FAILED");
    }
}
