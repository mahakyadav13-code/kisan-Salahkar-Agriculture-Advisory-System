# PROJECT SYNOPSIS

## KISAN SALAHKAR — Intelligent Agriculture Advisory System

---

## 1. Project Title

**Kisan Salahkar (किसान सलाहकार) — AI-Powered Agriculture Advisory System**

---

## 2. Project Team

| Role | Name |
|------|------|
| Developer | Ashutosh Kushwah |
| Guide | — |
| Institute | — |
| Academic Year | 2025–2026 |

---

## 3. Abstract

**Kisan Salahkar** is a comprehensive, AI-powered web application designed to empower Indian farmers with data-driven agricultural advisory services. The system integrates Machine Learning, Internet of Things (IoT), Computer Vision, Natural Language Processing (NLP), and real-time market intelligence into a single unified platform accessible via any web browser.

The platform provides **ML-based crop recommendations** using a Random Forest classifier trained on Indian agricultural data, **plant disease detection** using a MobileNetV2 Convolutional Neural Network (CNN) trained on 54,000+ leaf images, **real-time IoT sensor monitoring** via ESP32 microcontrollers, **live mandi (market) prices** from Government of India APIs, **7-day weather forecasting**, **AI chatbot consultation** powered by Google Gemini, and a **peer-to-peer marketplace** for direct farmer-to-farmer crop trading with integrated Razorpay payments.

The system supports **bilingual interaction** (Hindi & English) with voice input/output capabilities, **dark mode**, **Progressive Web App (PWA)** for offline access, and a fully responsive mobile-first design — making it accessible to farmers across rural and semi-urban India with limited internet connectivity.

---

## 4. Introduction

### 4.1 Background

Indian agriculture faces significant challenges including unpredictable weather, pest outbreaks, soil degradation, fluctuating market prices, and limited access to expert advisory services. Over 86% of Indian farmers are small and marginal, with landholdings under 2 hectares, and most lack access to timely, personalized agricultural guidance.

Traditional advisory methods — extension officers, Krishi Vigyan Kendras, and government bulletins — suffer from delayed information dissemination, language barriers, and inability to provide personalized recommendations based on local soil, weather, and market conditions.

### 4.2 Problem Statement

Farmers need a single, accessible platform that provides:
1. Personalized crop recommendations based on their specific soil, climate, and regional data.
2. Early disease detection to prevent crop losses.
3. Real-time weather and market intelligence for informed decision-making.
4. Direct market access to eliminate middlemen and improve income.
5. Expert advisory in their local language, available 24/7.

### 4.3 Proposed Solution

**Kisan Salahkar** addresses these challenges through an integrated web platform that combines:
- **Machine Learning** for crop recommendation and NPK prediction.
- **Deep Learning (CNN)** for automated plant disease diagnosis from leaf images.
- **IoT Hardware** (ESP32 sensors) for real-time soil and climate monitoring.
- **AI Chatbot** (Google Gemini) for natural-language farming consultations.
- **Government APIs** for live mandi prices and weather data.
- **P2P Marketplace** for direct farmer-to-farmer crop trading.

---

## 5. Objectives

1. **Smart Crop Recommendation**: Predict the most suitable crops based on soil nutrients (N, P, K), pH, temperature, humidity, rainfall, state, and season using supervised ML.
2. **Automated Disease Detection**: Identify 38 plant diseases from leaf images using a transfer-learning CNN, with treatment recommendations in Hindi and English.
3. **Real-Time Farm Monitoring**: Collect live sensor data (temperature, humidity, soil moisture, soil pH) via ESP32 IoT devices and display it on a web dashboard.
4. **Market Intelligence**: Display live wholesale mandi prices from 500+ commodities across Indian markets via Government of India's Agmarknet API.
5. **Weather Forecasting**: Provide current conditions and 7-day forecasts with farming-specific advisories (sowing suitability, spray warnings, frost alerts).
6. **AI Advisory**: Offer 24/7 conversational farming guidance via an AI chatbot with streaming responses, voice I/O, and context-aware recommendations.
7. **Direct Market Access**: Enable farmers to buy/sell crops directly through a P2P marketplace with photo uploads, price negotiation, chat, and digital payments.
8. **Accessibility**: Support bilingual (Hindi/English) interface, voice commands, dark mode, and PWA offline capability for low-connectivity rural areas.

---

## 6. System Architecture

### 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│   Browser (HTML5/CSS3/JS) │ PWA │ Voice (STT/TTS) │ Mobile     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/HTTPS (REST API + SSE)
┌───────────────────────────▼─────────────────────────────────────┐
│                     APPLICATION LAYER                           │
│                     Flask Web Server                            │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │
│  │   Auth   │ │  Crop    │ │  Disease  │ │    AI Chatbot    │  │
│  │  Module  │ │ Predictor│ │ Detector  │ │  (Gemini API)    │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │
│  │ Weather  │ │  Mandi   │ │   Forum   │ │   Marketplace    │  │
│  │  Module  │ │  Module  │ │  Module   │ │   (Razorpay)     │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │
│  │   IoT    │ │   Soil   │ │  Schemes  │ │  Notifications   │  │
│  │ Receiver │ │ Analysis │ │  Checker  │ │   & Alerts       │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
┌───────────────┐ ┌─────────────┐ ┌──────────────────┐
│   SQLite DB   │ │  ML Models  │ │  External APIs   │
│  (18 tables)  │ │ (3 models)  │ │ Gemini, Mandi,   │
│               │ │ RF, CNN,    │ │ Weather, Razorpay│
│               │ │ KNN (NPK)   │ │                  │
└───────────────┘ └─────────────┘ └──────────────────┘
            ▲
            │ WiFi (HTTPS POST every 30s)
┌───────────┴─────────────────────────────────────────┐
│                   IoT HARDWARE LAYER                │
│  ┌──────────────────┐    ┌─────────────────────┐    │
│  │  ESP32 Sensors   │    │    ESP32-CAM         │    │
│  │  • DHT11 (T/H)   │    │  • OV2640 Camera    │    │
│  │  • Soil Moisture  │    │  • Auto Capture     │    │
│  │  • pH Sensor      │    │  • Disease Detect   │    │
│  │  • Battery Mon.   │    │  • 18650 Battery    │    │
│  └──────────────────┘    └─────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 6.2 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Backend** | Python + Flask | Python 3.8+, Flask ≥ 3.0 | Web server, REST API, business logic |
| **Database** | SQLite3 | Built-in | 18-table relational schema |
| **ML — Crop** | scikit-learn (Random Forest) | ≥ 1.3.0 | Crop recommendation from soil/climate data |
| **ML — Disease** | TensorFlow/Keras (MobileNetV2 CNN) | ≥ 2.15.0 | Plant disease classification (38 classes) |
| **ML — NPK** | scikit-learn (KNN) | ≥ 1.3.0 | Predict N, P, K from sensor data |
| **AI/NLP** | Google Gemini API (gemini-2.5-flash) | Latest | Conversational chatbot + daily briefings |
| **Image Processing** | Pillow (PIL) | ≥ 10.0.0 | Image resize, crop, base64 decode |
| **Security** | bcrypt, bleach | ≥ 4.0, ≥ 6.0 | Password hashing, XSS sanitization |
| **Payments** | Razorpay SDK | Latest | P2P marketplace payment processing |
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) | — | Responsive UI, SPA-like navigation |
| **Voice** | Web Speech API (STT + TTS) | Browser-native | Hindi/English voice input and output |
| **PWA** | Service Worker + Manifest | — | Offline access, installable app |
| **IoT Hardware** | ESP32 DevKit V1, ESP32-CAM | — | Sensor data collection, leaf imaging |
| **Sensors** | DHT11, Capacitive Soil Moisture, Analog pH | — | Temperature, humidity, moisture, pH |
| **External APIs** | wttr.in, Open-Meteo, data.gov.in, ipapi.co | — | Weather, mandi prices, geolocation |

---

## 7. Modules Description

### 7.1 User Authentication & Profile Management
- Secure signup/login with **bcrypt** password hashing.
- Session-based authentication with Flask sessions.
- User profile: name, state, district, farm size (acres), preferred crops, language preference.
- Avatar color customization, GDPR-compliant data export and account deletion.

### 7.2 AI-Powered Crop Recommendation (Machine Learning)
- **Algorithm**: Random Forest Classifier trained on Indian agricultural datasets.
- **Inputs**: 7 features — Nitrogen (N), Phosphorus (P), Potassium (K), Temperature (°C), Humidity (%), soil pH, Rainfall (mm) + State + Season.
- **Output**: Top 5 recommended crops with confidence percentages, MSP (Minimum Support Price), growing tips (Hindi/English), and disease vulnerability.
- **Seasonal filtering**: Kharif (monsoon), Rabi (winter), Zaid (summer) season-aware recommendations.
- **Auto-fill from IoT**: Sensor readings (temperature, humidity, pH, moisture) can pre-populate the prediction form.

### 7.3 Plant Disease Detection (Deep Learning — CNN)
- **Model**: MobileNetV2 pre-trained on ImageNet, fine-tuned on **PlantVillage dataset** (~54,000 leaf images, 38 disease classes across 14 crops).
- **Training**: Two-phase transfer learning — Phase 1: frozen base (5 epochs), Phase 2: fine-tune top 50 layers (15 epochs).
- **Input Methods**: Camera upload, gallery image, symptom text description, voice input.
- **Output**: Disease name, confidence score, detailed treatment recommendations in Hindi & English.
- **Fallback**: Text-based keyword scoring when CNN is unavailable, matching symptoms to an 8-disease curated database.

### 7.4 Real-Time IoT Sensor Dashboard
- **Hardware**: ESP32 DevKit V1 microcontroller with:
  - **DHT11** sensor (GPIO 4): Temperature and humidity.
  - **Capacitive Soil Moisture** sensor (GPIO 34): Soil wetness via ADC.
  - **Analog pH Module** (GPIO 35): Soil acidity with voltage-to-pH calibration.
  - **Battery**: 2×18650 cells (7.4V) with voltage monitoring.
- **Data Pipeline**: ESP32 → WiFi → HTTPS POST (JSON) → Flask `/api/sensor/push` → SQLite → Dashboard.
- **Refresh Rate**: Every 30 seconds with online/offline status detection (30s staleness threshold).
- **Dashboard Features**: Live gauges with color-coded severity, 30-day historical charts (Chart.js), per-sensor disconnect detection, real-time advisories (irrigation alerts, frost warnings, fungal risk).
- **ESP32-CAM**: Automatic leaf photography → base64 upload → server-side CNN disease diagnosis.

### 7.5 Weather Forecasting
- **APIs**: wttr.in (current conditions) + Open-Meteo (7-day forecast with hourly granularity).
- **Data Points**: Temperature, humidity, wind speed/direction, UV index, precipitation probability, weather description.
- **Farming Advisories**: Sowing suitability, spray warnings, frost alerts, irrigation recommendations.
- **Location**: Auto-detected via IP geolocation (ipapi.co) or user profile state/district.

### 7.6 Live Mandi Price Tracking
- **Data Source**: Government of India **Agmarknet API** (data.gov.in) — 500+ commodities.
- **Features**: Filter by state, district, market; geolocation to nearest mandis; MSP vs actual price comparison.
- **Caching**: 1-hour cache to reduce API calls; fallback data for offline/API-failure scenarios.
- **User Features**: Bookmark favorite mandis, price trend indicators.

### 7.7 Government Schemes Eligibility Checker
- **Database**: 20+ central and state government agricultural schemes.
- **Eligibility Engine**: Matches user profile (state, farm size, crop type, category) against scheme criteria.
- **Output**: Eligible schemes with subsidy amounts, application process, deadlines, and direct portal links.

### 7.8 Soil Testing & Analysis
- **Inputs**: Macro-nutrients (N, P, K), pH, EC (Electrical Conductivity), Organic Carbon, Micro-nutrients (Zn, Fe, Mn, Cu, B, S).
- **Analysis**: Nutrient deficiency detection with targeted fertilizer recommendations.
- **Reports**: Saved to database for historical tracking and trend analysis.

### 7.9 AI Chatbot (Kisan Chat)
- **Engine**: Google **Gemini 2.5 Flash** with custom Hinglish system prompt.
- **Features**: Server-Sent Events (SSE) streaming for real-time responses, RAG (Retrieval-Augmented Generation) with farm context injection.
- **Voice**: Full voice input (STT) and output (TTS) in Hindi and English.
- **Persistence**: Chat history stored in localStorage (50 messages), survives page refresh.
- **Context-Aware**: Quick suggestions change based on current page (crop, weather, disease, etc.).

### 7.10 P2P Farmer Marketplace
- **Seller Features**: Create crop listings with quantity, quality grade, asking price, multiple photos (Pillow resize/crop).
- **Buyer Features**: Post purchase demands with maximum price and quantity requirements.
- **Price Intelligence**: Auto-price suggestion based on live Mandi MSP data.
- **Negotiation**: Real-time in-app chat between buyer and seller.
- **Payments**: **Razorpay** integration for secure digital payments with order creation and signature verification.
- **Deal Management**: Status tracking (pending → accepted → paid → delivered), logistics options.

### 7.11 Community Forum
- Threaded discussion posts categorized by topic.
- Like/upvote system for knowledge sharing.
- Input sanitization via **bleach** to prevent XSS attacks.

### 7.12 Notification & Alert System
- **In-App**: Bell icon with unread count badge, click-through to relevant pages.
- **SMS Alerts**: Weather warnings, price drops, marketplace activity (subscription-based).
- **Daily Farm Briefing**: AI-generated morning summary combining weather + sensor data + mandi prices + farming tips.

### 7.13 Multi-Language Support (i18n)
- Full Hindi and English translations via `LangManager` JS module.
- Language preference persisted per user.
- Dynamic string substitution using `data-i18n` HTML attributes.

### 7.14 Progressive Web App (PWA)
- **Service Worker**: Offline page caching for low-connectivity areas.
- **Manifest**: Installable as native app on Android/iOS with custom icon and splash screen.
- **Shortcuts**: Quick access to Crop Advice, Weather, and Mandi Prices from home screen.

### 7.15 Additional Features
- **Dark Mode**: Persistent light/dark theme with CSS custom properties and system preference detection.
- **Global Search**: Universal search across crops, diseases, schemes, and forum posts.
- **Onboarding Tour**: First-time user walkthrough of key features.
- **Skeleton Loading**: Animated placeholder content during data fetch.
- **Responsive Design**: Mobile-first CSS with flexbox/grid layouts.

---

## 8. Database Design

### 8.1 Database Schema (SQLite — 18 Tables)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `users` | id, email, password_hash, name, state, district, farm_size, lang, avatar_color | User accounts & profiles |
| `forum_posts` | id, user_id, title, body, category, likes, created_at | Community discussions |
| `forum_replies` | id, post_id, user_id, body, created_at | Post replies |
| `soil_reports` | id, user_id, N, P, K, pH, EC, OC, Zn, Fe, Mn, Cu, B, S | Soil test results |
| `sms_subscriptions` | id, user_id, phone, alert_types | SMS alert preferences |
| `sensor_readings` | id, device_id, temperature, humidity, moisture, ph, moisture_raw, ph_raw, ph_voltage, battery_v, wifi_rssi, created_at | IoT sensor data |
| `sensor_images` | id, device_id, image_data, diagnosis, confidence, created_at | ESP32-CAM captures |
| `favorite_mandis` | id, user_id, state, district, market, commodity | Saved market preferences |
| `prediction_history` | id, user_id, inputs_json, predictions_json, created_at | Crop recommendation logs |
| `market_listings` | id, user_id, crop, quantity, quality, price, status | Seller product listings |
| `market_demands` | id, user_id, crop, quantity, max_price, status | Buyer purchase requests |
| `market_deals` | id, listing_id, buyer_id, seller_id, price, status | Trade contracts |
| `market_messages` | id, deal_id, sender_id, message, created_at | Negotiation chat |
| `market_photos` | id, listing_id, filename | Product images |
| `market_payments` | id, deal_id, razorpay_order_id, amount, status | Payment records |
| `notifications` | id, user_id, type, title, message, link, read, created_at | In-app notifications |
| `daily_briefings` | id, user_id, content, weather_summary, sensor_summary, created_at | AI daily briefings |
| `briefing_schedule` | id, user_id, hour, minute, method, enabled | Briefing delivery config |

---

## 9. Machine Learning Models

### 9.1 Crop Recommendation Model

| Parameter | Details |
|-----------|---------|
| **Algorithm** | Random Forest Classifier (scikit-learn) |
| **Training Data** | Indian crop dataset with N, P, K, temperature, humidity, pH, rainfall |
| **Features** | 7 numeric inputs + state + season filtering |
| **Output** | Top 5 crops with confidence scores |
| **Serialization** | joblib (`crop_model.pkl`, `scaler.pkl`, `label_encoder.pkl`) |
| **Model Size** | ~88 MB |

### 9.2 Disease Detection Model

| Parameter | Details |
|-----------|---------|
| **Architecture** | MobileNetV2 (pre-trained on ImageNet) + custom classification head |
| **Dataset** | PlantVillage — ~54,000 images, 38 disease classes, 14 crop species |
| **Training** | Transfer Learning — Phase 1: frozen base (5 epochs, lr=1e-3), Phase 2: fine-tune top 50 layers (15 epochs, lr=1e-5) |
| **Input Size** | 224 × 224 × 3 (RGB) |
| **Data Augmentation** | Rotation (±20°), shift (±20%), shear (±20%), zoom (±20%), horizontal flip |
| **Output** | 38-class softmax probability distribution |
| **Formats** | `.keras` (full) + `.tflite` (lightweight fallback) |
| **Treatment DB** | 26 disease-treatment entries in Hindi and English |

### 9.3 NPK Prediction Model

| Parameter | Details |
|-----------|---------|
| **Algorithm** | K-Nearest Neighbors (KNN) |
| **Purpose** | Predict Nitrogen, Phosphorus, Potassium from sensor readings |
| **Inputs** | Temperature, humidity, pH, soil moisture |
| **Output** | Estimated N, P, K values for crop recommendation auto-fill |

---

## 10. IoT Hardware Specifications

### 10.1 ESP32 Sensor Node

| Component | Specification |
|-----------|--------------|
| **Microcontroller** | ESP32 DevKit V1 (Dual-core Xtensa LX6, 240 MHz) |
| **WiFi** | 802.11 b/g/n, 2.4 GHz |
| **Temperature/Humidity** | DHT11 — Range: 0-50°C / 20-90% RH, GPIO 4 |
| **Soil Moisture** | Capacitive sensor — ADC (0-4095), GPIO 34 |
| **Soil pH** | Analog pH module — Voltage-to-pH calibration, GPIO 35 |
| **Power** | 2 × 18650 Li-ion cells (7.4V), onboard 3.3V regulator |
| **Data Interval** | Every 30 seconds via HTTPS POST |
| **Firmware** | Arduino IDE (C++), ArduinoJson, DHT library |

### 10.2 ESP32-CAM Module

| Component | Specification |
|-----------|--------------|
| **Microcontroller** | ESP32-CAM (AI-Thinker) |
| **Camera** | OV2640 — 2MP, JPEG output |
| **Trigger** | GPIO 0 push button |
| **Flash LED** | GPIO 4 (status indication) |
| **Power** | 18650 battery via 5V holder |
| **Workflow** | Capture → Base64 encode → WiFi upload → Server CNN diagnosis |

### 10.3 Circuit Diagram (Pin Connections)

```
ESP32 DevKit V1
┌────────────────┐
│                │
│  GPIO 4  ──────┼──── DHT11 DATA (10kΩ pull-up to 3.3V)
│  GPIO 34 ──────┼──── Soil Moisture Sensor AOUT
│  GPIO 35 ──────┼──── pH Sensor Module Po (Analog Out)
│  3.3V    ──────┼──── Sensor VCC (all three)
│  GND     ──────┼──── Sensor GND (all three)
│  VIN     ──────┼──── 18650 Battery Pack (+7.4V)
│                │
└────────────────┘
```

---

## 11. API Architecture

### 11.1 Route Summary (83 Total Routes)

| Module | Routes | Key Endpoints |
|--------|--------|---------------|
| Authentication & Profile | 7 | `/api/signup`, `/api/login`, `/api/profile` |
| Crop Recommendation | 4 | `/api/predict`, `/api/state-crops` |
| Disease Detection | 2 | `/api/disease/detect`, `/api/disease/list` |
| Weather | 2 | `/api/weather`, `/api/rainfall/estimate` |
| Mandi Prices | 8 | `/api/mandi`, `/api/mandi/nearby`, `/api/mandi/favorites` |
| IoT Sensors | 5 | `/api/sensor/push`, `/api/sensor/latest`, `/api/sensor/camera` |
| AI Chatbot | 3 | `/api/chat`, `/api/chat/stream`, `/api/chat/action` |
| Marketplace | 15 | `/api/market/listing`, `/api/market/chat`, `/api/market/payment/*` |
| Forum | 4 | `/api/forum/posts`, `/api/forum/post`, `/api/forum/reply` |
| Schemes | 2 | `/api/schemes/check`, `/api/schemes` |
| Soil | 1 | `/api/soil/submit` |
| Notifications | 3 | `/api/notifications`, `/api/notifications/read` |
| Briefings | 3 | `/api/briefing/generate`, `/api/briefing/latest` |
| Search | 1 | `/api/search` |
| Voice | 1 | `/api/voice/command` |
| ML Model Mgmt | 2 | `/api/model/info`, `/api/model/reload` |
| Page Routes | 15 | `/`, `/dashboard`, `/crop`, `/weather`, etc. |
| PWA/Static | 5 | `/manifest.json`, `/sw.js` |

---

## 12. Security Implementation

| Measure | Implementation |
|---------|---------------|
| **Password Security** | bcrypt hashing with automatic salting |
| **XSS Prevention** | bleach library for HTML sanitization on all user inputs |
| **Session Security** | Flask server-side sessions with secret key |
| **API Authentication** | API key validation for IoT device communication |
| **Input Validation** | Server-side validation on all endpoints; file type/size checks |
| **SQL Injection** | Parameterized queries throughout (no string concatenation) |
| **GDPR Compliance** | Data export and account deletion features |
| **File Upload Security** | Extension whitelist (png, jpg, jpeg, webp), 5 MB size limit |

---

## 13. Screenshots & UI Features

| Page | Key UI Elements |
|------|----------------|
| **Dashboard** | Quick stat cards, Live sensor mini-widget, Premium weather widget, Mandi price widget, Daily farm briefing, Feature grid |
| **Crop Recommendation** | 7-field input form, State/district selectors, Auto-fill from sensors button, AI-predicted NPK badges, Top 5 results with confidence bars |
| **Disease Detection** | Camera/upload/text input, Voice description, Crop dropdown filter, Results with treatment cards, Prevention tips |
| **IoT Dashboard** | 4 live gauges (Temp/Humidity/Moisture/pH), Color-coded severity, Device status chip, Historical chart (6h/12h/24h/7d), Real-time advisories |
| **Marketplace** | Role selector (Buyer/Seller), Listing cards with photos, Price suggestions, Chat modal, Razorpay payment button |
| **Weather** | Current conditions card, 7-day forecast grid, Farming advisory |
| **Mandi Prices** | Commodity table, State/district filters, MSP comparison, Favorite bookmarks |

---

## 14. Testing & Validation

| Test Area | Approach |
|-----------|----------|
| **ML Model Accuracy** | Evaluated on held-out test set; confusion matrix and classification report |
| **API Testing** | Manual testing via browser; endpoint validation with JSON responses |
| **Security Testing** | XSS payload testing, SQL injection attempts on forms |
| **IoT Integration** | ESP32 live data verification; staleness detection testing |
| **Cross-Browser** | Chrome, Firefox, Edge, Safari (desktop & mobile) |
| **Responsive Design** | Tested on mobile (320px), tablet (768px), desktop (1024px+) |
| **PWA** | Service worker registration, offline mode, installability |
| **Voice** | Hindi and English STT/TTS across supported browsers |

---

## 15. System Requirements

### 15.1 Server Requirements

| Requirement | Specification |
|-------------|--------------|
| **Operating System** | Windows 10/11 or Linux (Ubuntu 20.04+) |
| **Python** | 3.8 or above |
| **RAM** | Minimum 2 GB (4 GB recommended for TensorFlow) |
| **Storage** | 500 MB for application + models |
| **Internet** | Required for external APIs (weather, mandi, Gemini) |

### 15.2 Client Requirements

| Requirement | Specification |
|-------------|--------------|
| **Browser** | Chrome 80+, Firefox 75+, Edge 80+, Safari 14+ |
| **JavaScript** | Enabled (ES6+ support) |
| **Bandwidth** | Minimum 256 kbps (optimized for low connectivity) |
| **Microphone** | Optional (for voice features) |
| **Camera** | Optional (for disease image capture) |

### 15.3 IoT Hardware Requirements

| Component | Estimated Cost (INR) |
|-----------|---------------------|
| ESP32 DevKit V1 | ₹350–500 |
| DHT11 Sensor | ₹50–80 |
| Capacitive Soil Moisture Sensor | ₹80–120 |
| pH Sensor Module (Analog) | ₹400–600 |
| ESP32-CAM (AI-Thinker) | ₹450–600 |
| 18650 Li-ion Cells (×2) | ₹200–300 |
| Battery Holder + Wiring | ₹50–100 |
| **Total** | **₹1,580–2,300** |

---

## 16. Installation & Deployment

### 16.1 Setup Commands

```bash
# Clone repository
git clone https://github.com/Kushwah1/Kisan-Salahkar.git
cd "Agriculture Advisory system"

# Install Python dependencies
pip install -r requirements.txt

# Train ML models (first time)
python train_model.py              # Crop recommendation model
python train_disease_model.py      # Disease detection CNN

# Run the application
python app.py
# Server starts at http://127.0.0.1:5000
```

### 16.2 Environment Variables (Optional)

| Variable | Purpose | Default |
|----------|---------|---------|
| `SECRET_KEY` | Flask session security | `kisan-salahkar-secret-2026` |
| `GEMINI_API_KEY` | Google Gemini AI chatbot | Required for chatbot |
| `RAZORPAY_KEY_ID` | Razorpay payment gateway | Test key |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | Test key |

---

## 17. Future Scope

1. **Mobile Application**: Native Android/iOS app using React Native or Flutter.
2. **Drone Integration**: Aerial crop monitoring and automated spraying.
3. **Blockchain**: Transparent supply chain tracking for farm produce.
4. **Advanced ML**: Yield prediction models, pest forecasting using satellite imagery.
5. **Multi-language Expansion**: Support for regional languages (Marathi, Tamil, Telugu, Bengali, Gujarati).
6. **Government Integration**: Direct API integration with PM-KISAN, e-NAM, and Soil Health Card portals.
7. **Cooperative Management**: Group farming tools, shared equipment booking, collective bargaining.
8. **Satellite Weather**: ISRO Megha-Tropiques satellite data for hyper-local weather predictions.

---

## 18. Conclusion

**Kisan Salahkar** is a comprehensive, production-ready agriculture advisory system that leverages modern AI/ML, IoT, and web technologies to address the critical information gap faced by Indian farmers. By integrating crop recommendation, disease detection, real-time sensor monitoring, market intelligence, and AI-powered advisory into a single bilingual platform, the system provides end-to-end farming support — from soil analysis to market sale.

The platform's use of **transfer learning (MobileNetV2)** for disease detection, **Random Forest ML** for crop recommendation, **ESP32 IoT hardware** for real-time farm monitoring, and **Google Gemini AI** for natural-language consultation demonstrates the practical application of cutting-edge technologies in solving real-world agricultural challenges.

With its **Progressive Web App** architecture, **voice interface**, and **low-bandwidth optimization**, Kisan Salahkar is designed to be accessible to farmers in even the most remote rural areas of India — making smart farming technology truly inclusive.

---

## 19. References

1. PlantVillage Dataset — Hughes, D.P., Salathé, M. (2015). "An open access repository of images on plant health to enable the development of mobile disease diagnostics."
2. MobileNetV2 — Sandler, M., et al. (2018). "MobileNetV2: Inverted Residuals and Linear Bottlenecks." IEEE/CVF CVPR.
3. scikit-learn — Pedregosa, F., et al. (2011). "Scikit-learn: Machine Learning in Python." JMLR 12.
4. TensorFlow — Abadi, M., et al. (2016). "TensorFlow: A System for Large-Scale Machine Learning." OSDI.
5. Flask Web Framework — https://flask.palletsprojects.com/
6. Google Gemini API — https://ai.google.dev/
7. data.gov.in Agmarknet API — https://data.gov.in/
8. Open-Meteo Weather API — https://open-meteo.com/
9. Razorpay Payment Gateway — https://razorpay.com/docs/
10. ESP32 Technical Reference — https://www.espressif.com/en/products/socs/esp32

---

*Document prepared: April 2026*
*GitHub Repository: https://github.com/Kushwah1/Kisan-Salahkar.git*
