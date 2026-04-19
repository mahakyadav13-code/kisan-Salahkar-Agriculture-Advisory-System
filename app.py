"""
app.py – Kisan Salahkar: Full-featured Agriculture Advisory System
Features: Auth, Crop Prediction, Weather, Soil Testing, Govt Schemes,
          Mandi Prices, Disease Detection, Community Forum, SMS Alerts,
          Multi-state support, Voice-ready APIs.
"""

import os, hashlib, sqlite3, json, time, base64, io, uuid
from datetime import datetime
import numpy as np
import joblib
import requests as http_requests
import bcrypt
import bleach
from PIL import Image
from flask import (
    Flask, render_template, request, jsonify,
    session, redirect, url_for, send_from_directory,
    Response, stream_with_context,
)
import google.generativeai as genai

# ── Flask setup ──────────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "kisan-salahkar-secret-2026")

# ── Upload folder for marketplace photos ─────────────────────────────────────
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "static", "uploads", "market")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5 MB

# ── Razorpay config ──────────────────────────────────────────────────────────
RAZORPAY_KEY_ID     = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_XXXXXXXXXXXXXXX")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "XXXXXXXXXXXXXXXXXXXXXXXX")

def _allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# ── Load ML artefacts ────────────────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")

ACTIVE_CROP_MODEL_FILES = {
    "model": "crop_model.pkl",
    "scaler": "scaler.pkl",
    "label_encoder": "label_encoder.pkl",
    "features": "features.pkl",
}


def _resolve_artifact_path(file_name: str) -> str:
    if os.path.isabs(file_name):
        return file_name
    return os.path.join(MODEL_DIR, file_name)


def load_crop_artifacts(model_file=None, scaler_file=None, label_encoder_file=None):
    """Load crop recommendation artefacts and make them active globally."""
    global model, scaler, label_encoder, feature_columns, ACTIVE_CROP_MODEL_FILES

    selected = {
        "model": model_file or os.environ.get("CROP_MODEL_FILE") or "crop_model.pkl",
        "scaler": scaler_file or os.environ.get("CROP_SCALER_FILE") or "scaler.pkl",
        "label_encoder": label_encoder_file or os.environ.get("CROP_LABEL_ENCODER_FILE") or "label_encoder.pkl",
        "features": os.environ.get("CROP_FEATURES_FILE") or "features.pkl",
    }

    paths = {k: _resolve_artifact_path(v) for k, v in selected.items()}
    missing = [f"model={paths['model']}" for _ in [0] if not os.path.exists(paths["model"])]
    if missing:
        raise FileNotFoundError("Missing crop artefacts: " + ", ".join(missing))

    model = joblib.load(paths["model"])
    scaler = joblib.load(paths["scaler"]) if os.path.exists(paths["scaler"]) else None
    label_encoder = joblib.load(paths["label_encoder"]) if os.path.exists(paths["label_encoder"]) else None

    default_features = ["N", "P", "K", "temperature", "humidity", "pH", "rainfall"]
    feature_columns = default_features
    if os.path.exists(paths["features"]):
        try:
            loaded_features = joblib.load(paths["features"])
            loaded_features = [str(x) for x in list(loaded_features)]
            if loaded_features:
                feature_columns = loaded_features
        except Exception as exc:
            print(f"⚠️  features.pkl could not be loaded: {exc}")

    ACTIVE_CROP_MODEL_FILES = selected
    return {
        "model": paths["model"],
        "scaler": paths["scaler"] if os.path.exists(paths["scaler"]) else "",
        "label_encoder": paths["label_encoder"] if os.path.exists(paths["label_encoder"]) else "",
        "features": paths["features"] if os.path.exists(paths["features"]) else "",
    }


def load_crop_metadata():
    global STATE_CROPS, CROP_DISEASES, STATE_DISTRICT_CROPS

    with open(os.path.join(MODEL_DIR, "state_crops.json"), encoding="utf-8") as f:
        STATE_CROPS = json.load(f)
    with open(os.path.join(MODEL_DIR, "crop_diseases.json"), encoding="utf-8") as f:
        CROP_DISEASES = json.load(f)

    STATE_DISTRICT_CROPS = {}
    _state_district_path = os.path.join(MODEL_DIR, "state_district_crops.json")
    if os.path.exists(_state_district_path):
        try:
            with open(_state_district_path, encoding="utf-8") as f:
                STATE_DISTRICT_CROPS = json.load(f)
        except Exception as e:
            print(f"⚠️  state_district_crops.json not loaded: {e}")


load_crop_artifacts()
load_crop_metadata()

# ── Load Disease CNN model (if trained) ──────────────────────────────────────
DISEASE_MODEL = None
DISEASE_LABELS = None
DISEASE_IMG_SIZE = 224
DISEASE_USE_TFLITE = False

_disease_model_path = os.path.join(MODEL_DIR, "disease_model.keras")
_disease_tflite_path = os.path.join(MODEL_DIR, "disease_model.tflite")
_disease_labels_path = os.path.join(MODEL_DIR, "disease_labels.json")

if os.path.exists(_disease_labels_path):
    with open(_disease_labels_path, encoding="utf-8") as f:
        DISEASE_LABELS = json.load(f)

    # Try full Keras model first
    if os.path.exists(_disease_model_path):
        try:
            import tensorflow as tf
            DISEASE_MODEL = tf.keras.models.load_model(_disease_model_path)
            print(f"✅ Disease CNN loaded — {len(DISEASE_LABELS)} classes")
        except Exception as e:
            print(f"⚠️  Disease CNN not loaded: {e}")
            DISEASE_MODEL = None

    # Fallback to TFLite model
    if DISEASE_MODEL is None and os.path.exists(_disease_tflite_path):
        try:
            import tensorflow as tf
            DISEASE_MODEL = tf.lite.Interpreter(model_path=_disease_tflite_path)
            DISEASE_MODEL.allocate_tensors()
            DISEASE_USE_TFLITE = True
            print(f"✅ Disease TFLite model loaded — {len(DISEASE_LABELS)} classes")
        except Exception as e:
            print(f"⚠️  Disease TFLite not loaded: {e}")
            DISEASE_MODEL = None

    if DISEASE_MODEL is None:
        print("ℹ️  Disease CNN not found. Run: python train_disease_model.py")
        print("   Text-based disease detection will be used as fallback.")
else:
    print("ℹ️  Disease CNN not found. Run: python train_disease_model.py")
    print("   Text-based disease detection will be used as fallback.")

# ── Load NPK Prediction model (if trained) ──────────────────────────────────
NPK_MODEL = None
NPK_SCALER = None
_npk_model_path = os.path.join(MODEL_DIR, "npk_model.pkl")
_npk_scaler_path = os.path.join(MODEL_DIR, "npk_scaler.pkl")

if os.path.exists(_npk_model_path) and os.path.exists(_npk_scaler_path):
    try:
        NPK_MODEL = joblib.load(_npk_model_path)
        NPK_SCALER = joblib.load(_npk_scaler_path)
        print("✅ NPK prediction model loaded (sensor → N, P, K)")
    except Exception as e:
        print(f"⚠️  NPK model not loaded: {e}")
        NPK_MODEL = None
else:
    print("ℹ️  NPK model not found. Run: python train_npk_model.py")

# ── Load State Rainfall Data (seasonal averages) ────────────────────────────
STATE_RAINFALL = {}
_rainfall_path = os.path.join(MODEL_DIR, "state_rainfall.json")
if os.path.exists(_rainfall_path):
    with open(_rainfall_path, encoding="utf-8") as f:
        STATE_RAINFALL = json.load(f)
    STATE_RAINFALL.pop("_comment", None)
    print(f"✅ State rainfall data loaded — {len(STATE_RAINFALL)} states")
else:
    print("ℹ️  state_rainfall.json not found — rainfall auto-fill disabled")

# ── Crop growing tips ────────────────────────────────────────────────────────

# ── Season-to-crop mapping (Kharif=monsoon, Rabi=winter, Zaid=summer) ────────
CROP_SEASON = {
    "kharif": ["Rice", "Maize", "Cotton", "Jute", "Groundnut", "Soybean",
               "Bajra", "Sugarcane", "Chili", "Banana"],
    "rabi":   ["Wheat", "Mustard", "Lentil", "Chickpea", "Potato", "Onion",
               "Cumin", "Maize"],
    "zaid":   ["Cucumber", "Watermelon", "Muskmelon", "Banana", "Sugarcane",
               "Maize", "Groundnut", "Tomato", "Onion", "Chili"],
}
# Reverse lookup: crop → set of seasons
CROP_TO_SEASONS = {}
for _season, _crops in CROP_SEASON.items():
    for _c in _crops:
        CROP_TO_SEASONS.setdefault(_c, set()).add(_season)
# Perennial crops (grow year-round) – always allowed
PERENNIAL_CROPS = {"Coffee", "Tea", "Coconut", "Mango", "Rubber", "Banana", "Sugarcane"}

CROP_TIPS = {
    "Rice":      "Requires standing water. Transplant seedlings 20–30 days old. Apply nitrogen in 3 splits.",
    "Wheat":     "Best sown in November. Irrigate at crown-root, tillering, flowering & grain-filling stages.",
    "Maize":     "Needs well-drained soil. Apply full P & K at sowing; split N in 2–3 doses.",
    "Cotton":    "Sow after monsoon onset. Use Bt-cotton hybrids for bollworm resistance. Pick in 3–4 rounds.",
    "Sugarcane": "Plant setts in spring. Earthing-up twice. Harvest at 10–12 months for peak sugar recovery.",
    "Jute":      "Broadcast seeds in March–April. Harvest at flower-bud stage for best fibre quality.",
    "Coffee":    "Shade-grown is preferred. Prune annually. Pick only ripe red cherries.",
    "Coconut":   "Maintain basin around the palm. Apply 50 kg organic manure/tree/year. Irrigate in summer.",
    "Banana":    "Use tissue-culture plants. Support with props after bunch emergence. Harvest at 75% maturity.",
    "Mango":     "Prune after harvest. Spray calcium-based nutrients at flowering. Bag fruits for quality.",
    "Groundnut": "Inoculate seeds with Rhizobium. Earth-up at 30 & 60 days. Harvest when leaves yellow.",
    "Soybean":   "Treat seeds with thiram + Rhizobium. Sow in rows 40 cm apart. 2 irrigations critical.",
    "Mustard":   "Thin seedlings to 15 cm spacing. Apply sulphur fertilizer. Harvest when pods turn brown.",
    "Lentil":    "Zero-till after rice is ideal. Seed-treat with Rhizobium. Harvest at physiological maturity.",
    "Chickpea":  "Sow on residual moisture. One irrigation at flowering boosts yield 30%. Watch for pod-borer.",
    "Potato":    "Use certified seed tubers. Ridge planting. Store in cold-store at 2–4 °C.",
    "Tomato":    "Stake or cage plants. Mulch to conserve moisture. Harvest at breaker stage for transport.",
    "Onion":     "Transplant 6-week-old seedlings. Stop irrigation 10 days before harvest. Cure bulbs in shade.",
    "Chili":     "Seedlings transplanted at 5–6 leaf stage. Pick ripe fruits every 8–10 days.",
    "Tea":       "Prune to table height every 3–5 years. Pluck '2 leaves + a bud'. Shade trees recommended.",
    "Bajra":     "Drought tolerant, ideal for arid zones. Thin plants to 15 cm. Apply zinc sulphate if deficient.",
    "Cumin":     "Sow in winter on well-drained sandy loam. Light irrigation at flowering. Harvest when seeds brown.",
    "Rubber":    "Tapping begins at 6–7 years. Tap every alternate day. Apply fertiliser in two splits.",
}

CROP_TIPS_HI = {
    "Rice":      "खड़े पानी की ज़रूरत। 20–30 दिन की पौध रोपें। नाइट्रोजन 3 बार में दें।",
    "Wheat":     "नवंबर में बुवाई सर्वोत्तम। ताजमूल, कल्ले, फूल और दाना भरते समय सिंचाई करें।",
    "Maize":     "अच्छी जल निकासी वाली मिट्टी चाहिए। पूरा P-K बुवाई पर, N 2–3 बार में दें।",
    "Cotton":    "मानसून शुरू होने पर बोएँ। बॉलवर्म के लिए Bt-कपास उपयोग करें। 3–4 बार चुनाई।",
    "Sugarcane": "बसंत में सेट लगाएँ। दो बार मिट्टी चढ़ाएँ। 10–12 महीने पर कटाई करें।",
    "Jute":      "मार्च–अप्रैल में बीज छिटकें। फूल कली अवस्था पर कटाई करें।",
    "Coffee":    "छायादार खेती उत्तम। हर साल छँटाई करें। सिर्फ पकी लाल चेरी तोड़ें।",
    "Coconut":   "पेड़ के चारों ओर थाला बनाएँ। 50 किग्रा जैविक खाद/पेड़/वर्ष। गर्मी में सिंचाई।",
    "Banana":    "टिशू-कल्चर पौधे उपयोग करें। गुच्छा आने पर सहारा दें। 75% परिपक्वता पर तोड़ें।",
    "Mango":     "तुड़ाई के बाद छँटाई। फूल पर कैल्शियम स्प्रे। गुणवत्ता हेतु फल बैगिंग करें।",
    "Groundnut": "बीज को राइज़ोबियम से उपचारित करें। 30 और 60 दिन पर मिट्टी चढ़ाएँ।",
    "Soybean":   "थिरम + राइज़ोबियम से बीजोपचार। 40 सेमी कतार में बोएँ। 2 सिंचाई ज़रूरी।",
    "Mustard":   "15 सेमी दूरी पर पौधे रखें। सल्फर उर्वरक दें। फलियाँ भूरी होने पर काटें।",
    "Lentil":    "धान के बाद ज़ीरो-टिल आदर्श। राइज़ोबियम से बीजोपचार। परिपक्वता पर कटाई।",
    "Chickpea":  "शेष नमी पर बोएँ। फूल पर एक सिंचाई से 30% उपज बढ़ती है। फली छेदक से बचाएँ।",
    "Potato":    "प्रमाणित बीज कंद उपयोग करें। मेड़ पर बुवाई। 2–4°C पर भंडारण।",
    "Tomato":    "पौधों को सहारा दें। नमी बचाने हेतु मल्चिंग। ब्रेकर अवस्था पर तोड़ें।",
    "Onion":     "6 सप्ताह की पौध रोपें। कटाई से 10 दिन पहले सिंचाई बंद। छाया में सुखाएँ।",
    "Chili":     "5–6 पत्ती अवस्था पर रोपाई। हर 8–10 दिन पके फल तोड़ें।",
    "Tea":       "हर 3–5 साल में मेज ऊँचाई पर छँटाई। '2 पत्ती + कली' तोड़ें। छायादार पेड़ लगाएँ।",
    "Bajra":     "सूखा सहनशील, शुष्क क्षेत्रों के लिए आदर्श। पौधे 15 सेमी पर रखें। ज़िंक सल्फेट दें।",
    "Cumin":     "सर्दी में अच्छी जल निकासी वाली दोमट मिट्टी पर बोएँ। फूल पर हल्की सिंचाई।",
    "Rubber":    "6–7 साल बाद टैपिंग शुरू। एक दिन छोड़कर टैप करें। खाद दो बार में दें।",
}

# ══════════════════════════════════════════════════════════════════════════════
#  LIVE MANDI PRICES — data.gov.in Agmarknet API
# ══════════════════════════════════════════════════════════════════════════════
# Register (free) at  https://data.gov.in/user/register  to get your own key.
# Set env var  DATA_GOV_API_KEY  or paste it below.
# The default key below is the public sample key from data.gov.in docs.
DATA_GOV_API_KEY = os.environ.get(
    "DATA_GOV_API_KEY",
    "579b464db66ec23bdd000001ccb584f6da7e411a4d7919984694c9e0",
)
DATA_GOV_MANDI_URL = (
    "https://api.data.gov.in/resource/"
    "9ef84268-d588-465a-a308-a864a43d0070"
)

# Our crop names ➜ data.gov.in commodity names
COMMODITY_MAP = {
    "Rice": "Rice", "Wheat": "Wheat", "Maize": "Maize",
    "Cotton": "Cotton", "Sugarcane": "Sugarcane",
    "Potato": "Potato", "Tomato": "Tomato", "Onion": "Onion",
    "Chili": "Green Chilli", "Soybean": "Soyabean",
    "Mustard": "Mustard", "Chickpea": "Bengal Gram(Gram)(Whole)",
    "Groundnut": "Groundnut", "Lentil": "Lentil (Masur)(Whole)",
    "Banana": "Banana", "Bajra": "Bajra(Pearl Millet/Cumbu)",
}
REVERSE_COMMODITY = {}
for _ck, _cv in COMMODITY_MAP.items():
    REVERSE_COMMODITY[_cv.strip().lower()] = _ck

# MSP ₹/quintal — Kharif & Rabi 2024-25 (update yearly)
MSP_DATA = {
    "Rice": 2300, "Wheat": 2275, "Maize": 2090, "Cotton": 7121,
    "Sugarcane": 315, "Potato": 0, "Tomato": 0, "Onion": 0,
    "Chili": 0, "Soybean": 4892, "Mustard": 5650, "Chickpea": 5440,
    "Groundnut": 6377, "Lentil": 6425, "Banana": 0, "Bajra": 2500,
}

# Indian states for dropdown filter
INDIAN_STATES = [
    "Andhra Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
    "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala",
    "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
    "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu",
    "Telangana","Tripura","Uttar Pradesh","Uttrakhand","West Bengal",
    "Chandigarh","NCT of Delhi","Jammu and Kashmir","Puducherry",
]

# ── In-memory cache (clears on server restart) ──
_mandi_cache: dict = {}
MANDI_CACHE_TTL = 3600          # 1 hour


def _safe_int(val):
    """Convert data.gov.in string values to int."""
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return 0


def _match_crop_name(commodity_raw: str):
    """Try to map an API commodity string back to our crop name."""
    low = commodity_raw.strip().lower()
    # exact match first
    hit = REVERSE_COMMODITY.get(low)
    if hit:
        return hit
    # partial / substring match
    for api_low, our_name in REVERSE_COMMODITY.items():
        if api_low in low or low in api_low:
            return our_name
    return None


def fetch_mandi_from_gov(commodity_key="", state="", district="", market="", limit=500):
    """Fetch commodity prices from data.gov.in Agmarknet API.

    Returns ``{"records": [...], "total": int, "fetched_at": str}`` or
    ``None`` when the API is unreachable / key missing.
    """
    if not DATA_GOV_API_KEY:
        return None

    cache_key = f"{commodity_key}|{state}|{district}|{market}|{limit}"
    now = time.time()
    cached = _mandi_cache.get(cache_key)
    if cached and (now - cached["ts"]) < MANDI_CACHE_TTL:
        return cached["data"]

    params = {
        "api-key": DATA_GOV_API_KEY,
        "format": "json",
        "limit": limit,
    }
    if commodity_key and commodity_key in COMMODITY_MAP:
        params["filters[commodity]"] = COMMODITY_MAP[commodity_key]
    if state:
        params["filters[state]"] = state
    if district:
        params["filters[district]"] = district
    if market:
        params["filters[market]"] = market

    try:
        resp = http_requests.get(DATA_GOV_MANDI_URL, params=params, timeout=12)
        resp.raise_for_status()
        body = resp.json()
        raw = body.get("records", [])
        records = []
        for r in raw:
            records.append({
                "market":      r.get("market", "").strip(),
                "state":       r.get("state", "").strip(),
                "district":    r.get("district", "").strip(),
                "commodity":   r.get("commodity", "").strip(),
                "variety":     r.get("variety", "").strip(),
                "date":        r.get("arrival_date", ""),
                "min_price":   _safe_int(r.get("min_price")),
                "max_price":   _safe_int(r.get("max_price")),
                "modal_price": _safe_int(r.get("modal_price")),
            })
        result = {
            "records": records,
            "total":   body.get("total", len(records)),
            "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
        _mandi_cache[cache_key] = {"data": result, "ts": now}
        return result
    except Exception as exc:
        print(f"[Mandi API] {exc}")
        return None


# ── Hardcoded fallback (used when API is down / no key) ──────────────────────
MANDI_FALLBACK = {
    "Rice":      [{"name":"Karnal","state":"Haryana","price":2250,"date":"—"},{"name":"Amritsar","state":"Punjab","price":2280,"date":"—"}],
    "Wheat":     [{"name":"Hapur","state":"UP","price":2310,"date":"—"},{"name":"Indore","state":"MP","price":2290,"date":"—"}],
    "Maize":     [{"name":"Gulbarga","state":"Karnataka","price":2100,"date":"—"},{"name":"Davangere","state":"Karnataka","price":2050,"date":"—"}],
    "Cotton":    [{"name":"Rajkot","state":"Gujarat","price":7100,"date":"—"},{"name":"Nagpur","state":"Maharashtra","price":6980,"date":"—"}],
    "Sugarcane": [{"name":"Muzaffarnagar","state":"UP","price":350,"date":"—"},{"name":"Kolhapur","state":"Maharashtra","price":320,"date":"—"}],
    "Potato":    [{"name":"Agra","state":"UP","price":800,"date":"—"},{"name":"Hooghly","state":"WB","price":750,"date":"—"}],
    "Tomato":    [{"name":"Kolar","state":"Karnataka","price":1200,"date":"—"},{"name":"Nashik","state":"Maharashtra","price":1100,"date":"—"}],
    "Onion":     [{"name":"Lasalgaon","state":"Maharashtra","price":1800,"date":"—"},{"name":"Nashik","state":"Maharashtra","price":1750,"date":"—"}],
    "Chili":     [{"name":"Guntur","state":"AP","price":14000,"date":"—"},{"name":"Khammam","state":"Telangana","price":13500,"date":"—"}],
    "Soybean":   [{"name":"Indore","state":"MP","price":4700,"date":"—"},{"name":"Latur","state":"Maharashtra","price":4650,"date":"—"}],
    "Mustard":   [{"name":"Alwar","state":"Rajasthan","price":5800,"date":"—"},{"name":"Bharatpur","state":"Rajasthan","price":5750,"date":"—"}],
    "Chickpea":  [{"name":"Indore","state":"MP","price":5500,"date":"—"},{"name":"Jaipur","state":"Rajasthan","price":5480,"date":"—"}],
    "Groundnut": [{"name":"Rajkot","state":"Gujarat","price":6500,"date":"—"},{"name":"Junagadh","state":"Gujarat","price":6450,"date":"—"}],
    "Lentil":    [{"name":"Indore","state":"MP","price":6500,"date":"—"},{"name":"Rewa","state":"MP","price":6450,"date":"—"}],
    "Banana":    [{"name":"Jalgaon","state":"Maharashtra","price":900,"date":"—"},{"name":"Tiruchirappalli","state":"Tamil Nadu","price":1000,"date":"—"}],
    "Bajra":     [{"name":"Jodhpur","state":"Rajasthan","price":2550,"date":"—"},{"name":"Hisar","state":"Haryana","price":2520,"date":"—"}],
}

# ── Government Scheme Data ───────────────────────────────────────────────────
GOVT_SCHEMES = [
    {
        "id": "pmkisan",
        "name": "PM-KISAN Samman Nidhi",
        "name_hi": "पीएम-किसान सम्मान निधि",
        "desc": "₹6,000/year direct income support in 3 instalments to farmer families.",
        "desc_hi": "किसान परिवारों को ₹6,000/वर्ष सीधे 3 किस्तों में।",
        "eligibility": {"land_max_ha": 100, "income_max": 0, "categories": ["all"]},
        "url": "https://pmkisan.gov.in",
        "benefits": "₹6,000 per year",
    },
    {
        "id": "pmfby",
        "name": "PM Fasal Bima Yojana",
        "name_hi": "पीएम फसल बीमा योजना",
        "desc": "Crop insurance at 2% premium for Kharif, 1.5% for Rabi, 5% for horticulture.",
        "desc_hi": "खरीफ में 2%, रबी में 1.5%, बागवानी में 5% प्रीमियम पर फसल बीमा।",
        "eligibility": {"land_max_ha": 100, "income_max": 0, "categories": ["all"]},
        "url": "https://pmfby.gov.in",
        "benefits": "Full crop insurance coverage",
    },
    {
        "id": "kcc",
        "name": "Kisan Credit Card",
        "name_hi": "किसान क्रेडिट कार्ड",
        "desc": "Short-term loans at 4% interest rate with prompt repayment discount.",
        "desc_hi": "समय पर भुगतान पर 4% ब्याज दर पर अल्पकालिक ऋण।",
        "eligibility": {"land_max_ha": 100, "income_max": 0, "categories": ["all"]},
        "url": "https://www.nabard.org",
        "benefits": "Loan up to ₹3 lakh at 4%",
    },
    {
        "id": "soil_health",
        "name": "Soil Health Card Scheme",
        "name_hi": "मृदा स्वास्थ्य कार्ड योजना",
        "desc": "Free soil testing every 2 years with nutrient-specific fertiliser recommendations.",
        "desc_hi": "हर 2 साल मुफ्त मिट्टी परीक्षण और उर्वरक सिफारिश।",
        "eligibility": {"land_max_ha": 100, "income_max": 0, "categories": ["all"]},
        "url": "https://soilhealth.dac.gov.in",
        "benefits": "Free soil testing",
    },
    {
        "id": "pmkmy",
        "name": "PM Kisan Maandhan Yojana",
        "name_hi": "पीएम किसान मानधन योजना",
        "desc": "Pension scheme: ₹3,000/month after age 60 for small & marginal farmers.",
        "desc_hi": "60 वर्ष के बाद ₹3,000/माह पेंशन — छोटे व सीमांत किसानों के लिए।",
        "eligibility": {"land_max_ha": 2, "income_max": 0, "categories": ["small", "marginal"]},
        "url": "https://maandhan.in",
        "benefits": "₹3,000/month pension after 60",
    },
    {
        "id": "enam",
        "name": "e-NAM (National Agriculture Market)",
        "name_hi": "ई-नाम (राष्ट्रीय कृषि बाज़ार)",
        "desc": "Online trading platform for transparent, competitive crop selling across mandis.",
        "desc_hi": "ऑनलाइन पारदर्शी मंडी व्यापार मंच।",
        "eligibility": {"land_max_ha": 100, "income_max": 0, "categories": ["all"]},
        "url": "https://enam.gov.in",
        "benefits": "Better prices through competition",
    },
    {
        "id": "pkvy",
        "name": "Paramparagat Krishi Vikas Yojana",
        "name_hi": "परम्परागत कृषि विकास योजना",
        "desc": "₹50,000/ha over 3 years for organic farming clusters of 50+ farmers.",
        "desc_hi": "50+ किसानों के जैविक खेती समूह को 3 वर्ष में ₹50,000/हेक्टेयर।",
        "eligibility": {"land_max_ha": 100, "income_max": 0, "categories": ["all"]},
        "url": "https://pgsindia-ncof.gov.in",
        "benefits": "₹50,000/ha for organic farming",
    },
    {
        "id": "pmksy",
        "name": "PM Krishi Sinchai Yojana",
        "name_hi": "पीएम कृषि सिंचाई योजना",
        "desc": "55% subsidy on micro-irrigation (drip/sprinkler) for small farmers.",
        "desc_hi": "छोटे किसानों को सूक्ष्म सिंचाई पर 55% सब्सिडी।",
        "eligibility": {"land_max_ha": 5, "income_max": 0, "categories": ["small", "marginal"]},
        "url": "https://pmksy.gov.in",
        "benefits": "55% subsidy on irrigation",
    },
]

# ── Simulated soil test reports ──────────────────────────────────────────────
SOIL_REPORTS = {}  # Will be stored in SQLite

# ── Common plant diseases with treatments ────────────────────────────────────
DISEASE_DB = {
    "Bacterial Leaf Blight": {
        "crop": "Rice", "type": "Bacterial",
        "symptoms": "Water-soaked lesions on leaves that turn yellow-white, wilting leaf tips.",
        "symptoms_hi": "पत्तियों पर पानी जैसे धब्बे जो पीले-सफेद हो जाते हैं, पत्ती की नोक मुरझाना।",
        "treatment": "Use resistant varieties (Samba Mahsuri). Avoid excess N. Spray Streptocycline 0.01%.",
        "treatment_hi": "प्रतिरोधी किस्में (सांबा मसूरी) उपयोग करें। अधिक N से बचें। स्ट्रेप्टोसाइक्लिन 0.01% छिड़कें।",
        "severity": "high",
    },
    "Late Blight": {
        "crop": "Potato/Tomato", "type": "Fungal",
        "symptoms": "Dark brown spots on leaves with white mold underneath. Rapid plant death.",
        "symptoms_hi": "पत्तियों पर गहरे भूरे धब्बे, नीचे सफेद फफूंद। तेजी से पौधा सूखना।",
        "treatment": "Spray Mancozeb 0.25% at 10-day intervals. Destroy infected plants. Use resistant varieties.",
        "treatment_hi": "मैन्कोज़ेब 0.25% हर 10 दिन छिड़कें। संक्रमित पौधे नष्ट करें। प्रतिरोधी किस्में लगाएँ।",
        "severity": "high",
    },
    "Powdery Mildew": {
        "crop": "Multiple", "type": "Fungal",
        "symptoms": "White powdery coating on leaves and stems. Leaves curl and dry.",
        "symptoms_hi": "पत्तियों और तने पर सफेद पाउडर जैसी परत। पत्ते मुड़ कर सूखते हैं।",
        "treatment": "Spray Sulphur WP 0.3% or Karathane 0.05%. Ensure good air circulation.",
        "treatment_hi": "सल्फर WP 0.3% या कैराथेन 0.05% छिड़कें। हवा का अच्छा संचार सुनिश्चित करें।",
        "severity": "medium",
    },
    "Fusarium Wilt": {
        "crop": "Multiple", "type": "Fungal",
        "symptoms": "Yellowing of lower leaves, wilting on one side, brown vascular tissue.",
        "symptoms_hi": "निचली पत्तियों का पीलापन, एक तरफ मुरझाना, भूरे संवहनी ऊतक।",
        "treatment": "Use resistant varieties. Treat seed with Trichoderma. Crop rotation with cereals.",
        "treatment_hi": "प्रतिरोधी किस्में उपयोग करें। ट्राइकोडर्मा से बीजोपचार। अनाज के साथ फसल चक्र।",
        "severity": "high",
    },
    "Leaf Curl Virus": {
        "crop": "Chili/Tomato", "type": "Viral",
        "symptoms": "Upward curling of leaves, stunted growth, reduced fruit set.",
        "symptoms_hi": "पत्तियों का ऊपर की ओर मुड़ना, बौना विकास, फल कम लगना।",
        "treatment": "Control whitefly vectors with Imidacloprid. Use virus-free seedlings. Yellow sticky traps.",
        "treatment_hi": "इमिडाक्लोप्रिड से सफेद मक्खी नियंत्रण। वायरस-मुक्त पौध उपयोग करें। पीले चिपचिपे ट्रैप।",
        "severity": "medium",
    },
    "Rust": {
        "crop": "Wheat/Soybean", "type": "Fungal",
        "symptoms": "Orange-brown pustules on leaves and stems. Premature drying.",
        "symptoms_hi": "पत्तियों और तने पर नारंगी-भूरे दाने। समय से पहले सूखना।",
        "treatment": "Grow resistant varieties. Spray Propiconazole 25EC @ 0.1%. Early sowing helps.",
        "treatment_hi": "प्रतिरोधी किस्में उगाएँ। प्रोपिकोनाज़ोल 25EC @0.1% छिड़कें। जल्दी बुवाई सहायक।",
        "severity": "high",
    },
    "Anthracnose": {
        "crop": "Mango/Chili", "type": "Fungal",
        "symptoms": "Dark sunken spots on fruits and leaves. Fruit rot during storage.",
        "symptoms_hi": "फलों और पत्तियों पर गहरे धँसे धब्बे। भंडारण में फल सड़ना।",
        "treatment": "Spray Carbendazim 0.1% before and after flowering. Proper fruit handling.",
        "treatment_hi": "फूल से पहले और बाद कार्बेन्डाज़िम 0.1% छिड़कें। फलों को सही तरीके से रखें।",
        "severity": "medium",
    },
    "Bollworm": {
        "crop": "Cotton", "type": "Pest",
        "symptoms": "Holes in bolls, frass visible. Damaged bolls with larvae inside.",
        "symptoms_hi": "बॉल्स में छेद, कीट मल दिखाई देना। लार्वा वाले क्षतिग्रस्त बॉल्स।",
        "treatment": "Use Bt cotton varieties. Install pheromone traps. Spray Spinosad if severe.",
        "treatment_hi": "Bt कपास किस्में उपयोग करें। फेरोमोन ट्रैप लगाएँ। गंभीर होने पर स्पिनोसैड छिड़कें।",
        "severity": "high",
    },
}


# ── SQLite helper ─────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _safe_alter(conn, table, column, coldef):
    """Add a column to a table if it doesn't already exist (SQLite migration helper)."""
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coldef}")
    except Exception:
        pass  # column already exists

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone    TEXT DEFAULT '',
            state    TEXT DEFAULT '',
            location TEXT DEFAULT '',
            land_ha  REAL DEFAULT 0,
            category TEXT DEFAULT 'all',
            district       TEXT DEFAULT '',
            village        TEXT DEFAULT '',
            primary_crops  TEXT DEFAULT '',
            irrigation     TEXT DEFAULT '',
            soil_type      TEXT DEFAULT '',
            lang_pref      TEXT DEFAULT 'en',
            avatar_color   TEXT DEFAULT '#15803d',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Forum posts
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forum_posts (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER,
            username   TEXT NOT NULL,
            title      TEXT NOT NULL,
            content    TEXT NOT NULL,
            category   TEXT DEFAULT 'general',
            likes      INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # Forum replies
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forum_replies (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id    INTEGER,
            user_id    INTEGER,
            username   TEXT NOT NULL,
            content    TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES forum_posts(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # Soil test reports
    conn.execute("""
        CREATE TABLE IF NOT EXISTS soil_reports (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id  TEXT UNIQUE NOT NULL,
            user_id    INTEGER,
            N          REAL, P REAL, K REAL,
            pH         REAL, EC REAL,
            OC         REAL, S REAL, Zn REAL, Fe REAL, Mn REAL, Cu REAL, B REAL,
            soil_type  TEXT,
            location   TEXT,
            state      TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # SMS alert subscriptions
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sms_subscriptions (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER,
            phone     TEXT NOT NULL,
            alert_type TEXT DEFAULT 'all',
            city      TEXT DEFAULT '',
            active    INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # ── IoT Sensor Readings ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sensor_readings (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id     TEXT NOT NULL,
            temperature   REAL,
            humidity      REAL,
            moisture      REAL,
            ph            REAL,
            moisture_raw  INTEGER DEFAULT 0,
            ph_raw        INTEGER DEFAULT 0,
            ph_voltage    REAL DEFAULT 0,
            battery_v     REAL DEFAULT 0,
            wifi_rssi     INTEGER DEFAULT 0,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Migrate existing DB — add raw columns if missing
    try:
        conn.execute("ALTER TABLE sensor_readings ADD COLUMN moisture_raw INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE sensor_readings ADD COLUMN ph_raw INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE sensor_readings ADD COLUMN ph_voltage REAL DEFAULT 0")
    except Exception:
        pass
    # Migrate users table — add new profile columns
    for col_def in [
        "district TEXT DEFAULT ''", "village TEXT DEFAULT ''",
        "primary_crops TEXT DEFAULT ''", "irrigation TEXT DEFAULT ''",
        "soil_type TEXT DEFAULT ''", "lang_pref TEXT DEFAULT 'en'",
        "avatar_color TEXT DEFAULT '#15803d'"
    ]:
        try:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col_def}")
        except Exception:
            pass
    # ── IoT Camera Captures ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sensor_images (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT NOT NULL,
            image_data  TEXT,
            diagnosis   TEXT DEFAULT '',
            confidence  REAL DEFAULT 0,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # ── Favorite Mandis ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS favorite_mandis (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            state      TEXT NOT NULL DEFAULT '',
            district   TEXT NOT NULL DEFAULT '',
            market     TEXT NOT NULL DEFAULT '',
            label      TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, state, district, market)
        )
    """)
    # ── Prediction History ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS prediction_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            state      TEXT DEFAULT '',
            district   TEXT DEFAULT '',
            season     TEXT DEFAULT '',
            input_data TEXT DEFAULT '{}',
            top_crop   TEXT DEFAULT '',
            confidence REAL DEFAULT 0,
            all_predictions TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # ── Marketplace: Listings (seller lots) ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_listings (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            crop       TEXT NOT NULL,
            qty_kg     REAL NOT NULL DEFAULT 0,
            quality    TEXT DEFAULT 'standard',
            ask_price  REAL DEFAULT 0,
            location   TEXT DEFAULT '',
            state      TEXT DEFAULT '',
            district   TEXT DEFAULT '',
            description TEXT DEFAULT '',
            status     TEXT DEFAULT 'active',
            auto_price REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # ── Marketplace: Buyer demands ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_demands (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            crop       TEXT NOT NULL,
            qty_kg     REAL NOT NULL DEFAULT 0,
            max_price  REAL DEFAULT 0,
            location   TEXT DEFAULT '',
            state      TEXT DEFAULT '',
            district   TEXT DEFAULT '',
            notify     INTEGER DEFAULT 1,
            status     TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # ── Marketplace: Deals / Contracts ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_deals (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            listing_id   INTEGER NOT NULL,
            seller_id    INTEGER NOT NULL,
            buyer_id     INTEGER NOT NULL,
            crop         TEXT NOT NULL,
            qty_kg       REAL NOT NULL,
            deal_price   REAL NOT NULL,
            total_amount REAL NOT NULL,
            logistics    TEXT DEFAULT '{}',
            status       TEXT DEFAULT 'pending',
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (listing_id) REFERENCES market_listings(id),
            FOREIGN KEY (seller_id) REFERENCES users(id),
            FOREIGN KEY (buyer_id) REFERENCES users(id)
        )
    """)
    # ── Marketplace: Chat messages for negotiation ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            deal_id    INTEGER,
            listing_id INTEGER,
            sender_id  INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            message    TEXT NOT NULL,
            msg_type   TEXT DEFAULT 'text',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (receiver_id) REFERENCES users(id)
        )
    """)
    # ── Marketplace: Photo uploads per listing ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_photos (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            listing_id INTEGER NOT NULL,
            filename   TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (listing_id) REFERENCES market_listings(id)
        )
    """)
    # ── Marketplace: Payments (Razorpay) ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_payments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            deal_id         INTEGER NOT NULL,
            razorpay_order_id TEXT,
            razorpay_payment_id TEXT,
            razorpay_signature TEXT,
            amount_paise    INTEGER NOT NULL DEFAULT 0,
            currency        TEXT DEFAULT 'INR',
            status          TEXT DEFAULT 'created',
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (deal_id) REFERENCES market_deals(id)
        )
    """)
    # ── Migration: add columns if missing (safe for existing DBs) ──
    _safe_alter(conn, "market_listings", "photos", "TEXT DEFAULT '[]'")
    _safe_alter(conn, "market_listings", "delivery_options", "TEXT DEFAULT 'pickup'")
    _safe_alter(conn, "market_listings", "seller_address", "TEXT DEFAULT ''")
    _safe_alter(conn, "market_deals", "pickup_address", "TEXT DEFAULT ''")
    _safe_alter(conn, "market_deals", "delivery_address", "TEXT DEFAULT ''")
    _safe_alter(conn, "market_deals", "delivery_type", "TEXT DEFAULT 'pickup'")
    _safe_alter(conn, "market_deals", "transport_cost", "REAL DEFAULT 0")
    _safe_alter(conn, "market_deals", "payment_status", "TEXT DEFAULT 'unpaid'")
    _safe_alter(conn, "market_deals", "payment_id", "INTEGER DEFAULT 0")
    # ── In-app Notifications ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            type        TEXT NOT NULL DEFAULT 'info',
            title       TEXT NOT NULL,
            body        TEXT DEFAULT '',
            link        TEXT DEFAULT '',
            is_read     INTEGER DEFAULT 0,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # ── Daily Farm Briefings ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_briefings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            date        TEXT NOT NULL,
            briefing    TEXT NOT NULL,
            weather     TEXT DEFAULT '{}',
            sensor      TEXT DEFAULT '{}',
            mandi       TEXT DEFAULT '{}',
            alerts      TEXT DEFAULT '[]',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS briefing_schedule (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL UNIQUE,
            enabled     INTEGER DEFAULT 1,
            time_hour   INTEGER DEFAULT 6,
            time_min    INTEGER DEFAULT 0,
            delivery    TEXT DEFAULT 'app',
            phone       TEXT DEFAULT '',
            city        TEXT DEFAULT '',
            crops       TEXT DEFAULT '',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        # Fallback: check legacy SHA256 hash for old accounts
        return hashlib.sha256(pw.encode()).hexdigest() == hashed

def sanitize(text: str) -> str:
    """Strip all HTML tags from user input to prevent XSS."""
    return bleach.clean(text, tags=[], strip=True)


# ── Page routes ───────────────────────────────────────────────────────────────
@app.route("/")
def index():
    if "user" in session:
        return redirect(url_for("dashboard"))
    return render_template("index.html")

@app.route("/dashboard")
def dashboard():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("dashboard.html", user=session["user"])

@app.route("/crop")
def crop():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("crop.html", states=list(STATE_CROPS.keys()))

@app.route("/weather")
def weather():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("weather.html")

@app.route("/info")
def info():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("info.html")

@app.route("/soil")
def soil():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("soil.html")

@app.route("/schemes")
def schemes():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("schemes.html")

@app.route("/mandi")
def mandi():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("mandi.html")

@app.route("/marketplace")
def marketplace():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("marketplace.html", user=session["user"], states=list(STATE_CROPS.keys()))

@app.route("/disease")
def disease():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("disease.html")

@app.route("/iot")
def iot_dashboard():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("iot.html", user=session["user"])

@app.route("/forum")
def forum():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("forum.html", user=session["user"])

@app.route("/alerts")
def alerts():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("alerts.html", user=session["user"])

@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("index"))


# ── Profile Page & API ────────────────────────────────────────────────────────
@app.route("/profile")
def profile():
    if "user" not in session:
        return redirect(url_for("index"))
    conn = get_db()
    username = session["user"]["username"]
    user_row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not user_row:
        conn.close()
        return redirect(url_for("index"))
    uid = user_row["id"]
    # Activity stats
    predictions_count = conn.execute("SELECT COUNT(*) c FROM prediction_history WHERE user_id=?", (uid,)).fetchone()["c"]
    soil_count = conn.execute("SELECT COUNT(*) c FROM soil_reports WHERE user_id=?", (uid,)).fetchone()["c"]
    forum_posts_count = conn.execute("SELECT COUNT(*) c FROM forum_posts WHERE user_id=?", (uid,)).fetchone()["c"]
    forum_replies_count = conn.execute("SELECT COUNT(*) c FROM forum_replies WHERE user_id=?", (uid,)).fetchone()["c"]
    alerts_count = conn.execute("SELECT COUNT(*) c FROM sms_subscriptions WHERE user_id=? AND active=1", (uid,)).fetchone()["c"]
    fav_mandis_count = conn.execute("SELECT COUNT(*) c FROM favorite_mandis WHERE user_id=?", (uid,)).fetchone()["c"]
    # Recent predictions (last 10)
    predictions = conn.execute(
        "SELECT state, district, season, top_crop, confidence, created_at FROM prediction_history WHERE user_id=? ORDER BY created_at DESC LIMIT 10", (uid,)
    ).fetchall()
    # Recent soil reports (last 5)
    soil_reports = conn.execute(
        "SELECT report_id, N, P, K, pH, soil_type, location, created_at FROM soil_reports WHERE user_id=? ORDER BY created_at DESC LIMIT 5", (uid,)
    ).fetchall()
    # Favorite mandis
    fav_mandis = conn.execute(
        "SELECT state, district, market, label FROM favorite_mandis WHERE user_id=?", (uid,)
    ).fetchall()
    # Alert subscriptions
    alert_subs = conn.execute(
        "SELECT alert_type, city, active FROM sms_subscriptions WHERE user_id=?", (uid,)
    ).fetchall()
    conn.close()
    # Compute badges
    badges = []
    if predictions_count > 0:
        badges.append({"icon": "fa-seedling", "name": "First Prediction", "color": "#22c55e"})
    if predictions_count >= 10:
        badges.append({"icon": "fa-brain", "name": "AI Expert", "color": "#8b5cf6"})
    if soil_count >= 1:
        badges.append({"icon": "fa-flask-vial", "name": "Soil Tester", "color": "#d97706"})
    if soil_count >= 3:
        badges.append({"icon": "fa-flask-vial", "name": "Soil Expert", "color": "#ea580c"})
    if forum_posts_count >= 1:
        badges.append({"icon": "fa-comments", "name": "Community Member", "color": "#0ea5e9"})
    if forum_posts_count >= 10:
        badges.append({"icon": "fa-comments", "name": "Community Helper", "color": "#2563eb"})
    if fav_mandis_count >= 1:
        badges.append({"icon": "fa-store", "name": "Market Watcher", "color": "#ec4899"})
    if alerts_count >= 1:
        badges.append({"icon": "fa-bell", "name": "Alert Subscriber", "color": "#f59e0b"})
    return render_template("profile.html",
        user=session["user"],
        profile=dict(user_row),
        stats={
            "predictions": predictions_count, "soil_tests": soil_count,
            "forum_posts": forum_posts_count, "forum_replies": forum_replies_count,
            "alerts": alerts_count, "fav_mandis": fav_mandis_count
        },
        predictions=[dict(p) for p in predictions],
        soil_reports=[dict(s) for s in soil_reports],
        fav_mandis=[dict(m) for m in fav_mandis],
        alert_subs=[dict(a) for a in alert_subs],
        badges=badges
    )


@app.route("/api/profile", methods=["GET"])
def api_profile_get():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (session["user"]["username"],)).fetchone()
    conn.close()
    if not row:
        return jsonify(success=False, error="User not found"), 404
    return jsonify(success=True, profile={
        "name": row["name"], "username": row["username"], "phone": row["phone"] or "",
        "state": row["state"] or "", "location": row["location"] or "",
        "district": row["district"] or "", "village": row["village"] or "",
        "land_ha": row["land_ha"] or 0, "category": row["category"] or "all",
        "primary_crops": row["primary_crops"] or "", "irrigation": row["irrigation"] or "",
        "soil_type": row["soil_type"] or "", "lang_pref": row["lang_pref"] or "en",
        "avatar_color": row["avatar_color"] or "#15803d",
        "created_at": row["created_at"]
    })


@app.route("/api/profile", methods=["PUT"])
def api_profile_update():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    allowed = ["name", "phone", "state", "location", "district", "village",
               "land_ha", "category", "primary_crops", "irrigation", "soil_type",
               "lang_pref", "avatar_color"]
    updates = {}
    for key in allowed:
        if key in data:
            val = data[key]
            if key == "land_ha":
                try:
                    val = float(val) if val else 0
                except (ValueError, TypeError):
                    val = 0
            elif isinstance(val, str):
                val = sanitize(val.strip())
            updates[key] = val
    if not updates:
        return jsonify(success=False, error="No fields to update"), 400
    conn = get_db()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    values = list(updates.values()) + [session["user"]["username"]]
    conn.execute(f"UPDATE users SET {set_clause} WHERE username=?", values)
    conn.commit()
    # Refresh session
    row = conn.execute("SELECT * FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    conn.close()
    session["user"] = {
        "name": row["name"], "username": row["username"],
        "state": row["state"] or "", "phone": row["phone"] or "",
        "location": row["location"] or "",
        "district": row["district"] or "", "village": row["village"] or ""
    }
    return jsonify(success=True)


@app.route("/api/profile/password", methods=["PUT"])
def api_profile_password():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    current = data.get("current_password", "").strip()
    new_pw = data.get("new_password", "").strip()
    if not current or not new_pw:
        return jsonify(success=False, error="Both passwords required"), 400
    if len(new_pw) < 6:
        return jsonify(success=False, error="Password must be at least 6 characters"), 400
    conn = get_db()
    row = conn.execute("SELECT password FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not row or not check_pw(current, row["password"]):
        conn.close()
        return jsonify(success=False, error="Current password is incorrect"), 401
    conn.execute("UPDATE users SET password=? WHERE username=?", (hash_pw(new_pw), session["user"]["username"]))
    conn.commit()
    conn.close()
    return jsonify(success=True)


@app.route("/api/profile/delete", methods=["DELETE"])
def api_profile_delete():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    password = data.get("password", "").strip()
    conn = get_db()
    row = conn.execute("SELECT id, password FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not row or not check_pw(password, row["password"]):
        conn.close()
        return jsonify(success=False, error="Incorrect password"), 401
    uid = row["id"]
    conn.execute("DELETE FROM forum_posts WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM forum_replies WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM soil_reports WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM sms_subscriptions WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM favorite_mandis WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM prediction_history WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM users WHERE id=?", (uid,))
    conn.commit()
    conn.close()
    session.pop("user", None)
    return jsonify(success=True)


@app.route("/api/profile/export")
def api_profile_export():
    """Download all user data as JSON (GDPR-style)."""
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not row:
        conn.close()
        return jsonify(success=False, error="User not found"), 404
    uid = row["id"]
    export = {
        "profile": {k: row[k] for k in row.keys() if k != "password"},
        "predictions": [dict(r) for r in conn.execute("SELECT * FROM prediction_history WHERE user_id=?", (uid,)).fetchall()],
        "soil_reports": [dict(r) for r in conn.execute("SELECT * FROM soil_reports WHERE user_id=?", (uid,)).fetchall()],
        "forum_posts": [dict(r) for r in conn.execute("SELECT * FROM forum_posts WHERE user_id=?", (uid,)).fetchall()],
        "forum_replies": [dict(r) for r in conn.execute("SELECT * FROM forum_replies WHERE user_id=?", (uid,)).fetchall()],
        "alert_subscriptions": [dict(r) for r in conn.execute("SELECT * FROM sms_subscriptions WHERE user_id=?", (uid,)).fetchall()],
        "favorite_mandis": [dict(r) for r in conn.execute("SELECT * FROM favorite_mandis WHERE user_id=?", (uid,)).fetchall()],
    }
    conn.close()
    return jsonify(success=True, data=export)


# ── PWA ───────────────────────────────────────────────────────────────────────
@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json")

@app.route("/sw.js")
def service_worker():
    return send_from_directory("static", "sw.js")


# ── Auth API ──────────────────────────────────────────────────────────────────
@app.route("/api/signup", methods=["POST"])
def api_signup():
    data = request.get_json(force=True)
    name     = sanitize(data.get("name", "").strip())
    username = sanitize(data.get("username", "").strip())
    password = data.get("password", "").strip()
    phone    = sanitize(data.get("phone", "").strip())
    state    = sanitize(data.get("state", "").strip())
    location = sanitize(data.get("location", "").strip())

    if not username or not password:
        return jsonify(success=False, error="Username and password required"), 400
    if len(password) < 6:
        return jsonify(success=False, error="Password must be at least 6 characters"), 400

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (name, username, password, phone, state, location) VALUES (?, ?, ?, ?, ?, ?)",
            (name or username, username, hash_pw(password), phone, state, location),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify(success=False, error="Username already exists"), 409
    finally:
        conn.close()

    session["user"] = {"name": name or username, "username": username, "state": state, "phone": phone, "location": location}
    return jsonify(success=True)


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(force=True)
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    conn = get_db()
    row = conn.execute(
        "SELECT * FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    conn.close()

    if row is None or not check_pw(password, row["password"]):
        return jsonify(success=False, error="Invalid credentials"), 401

    session["user"] = {
        "name": row["name"], "username": row["username"],
        "state": row["state"] or "", "phone": row["phone"] or "",
        "location": row["location"] if "location" in row.keys() else "",
        "district": row["district"] if "district" in row.keys() else "",
        "village": row["village"] if "village" in row.keys() else ""
    }
    return jsonify(success=True)


# ── Crop prediction API ──────────────────────────────────────────────────────
@app.route("/api/predict", methods=["POST"])
def api_predict():
    data = request.get_json(force=True)

    def _value_for_feature(col: str):
        if col in data:
            return data[col]
        low = col.lower()
        if low in data:
            return data[low]
        if col == "ph" and "pH" in data:
            return data["pH"]
        if col == "pH" and "ph" in data:
            return data["ph"]
        raise KeyError(col)

    try:
        features = np.array([[float(_value_for_feature(col)) for col in feature_columns]])
    except (KeyError, ValueError) as exc:
        return jsonify(success=False, error=f"Invalid input: {exc}"), 400

    state = data.get("state", "").strip()
    district = data.get("district", "").strip()
    season = data.get("season", "").strip().lower()

    # Soil moisture (not a model feature, but used for advisory)
    soil_moisture_raw = data.get("soil_moisture", "")
    soil_moisture = None
    if soil_moisture_raw not in (None, ""):
        try:
            soil_moisture = float(soil_moisture_raw)
        except (ValueError, TypeError):
            pass

    # Auto-detect season from current month if not provided
    if not season:
        month = datetime.now().month
        if month in (6, 7, 8, 9, 10):
            season = "kharif"
        elif month in (11, 12, 1, 2, 3):
            season = "rabi"
        else:
            season = "zaid"

    crop_alias = {
        "pigeonpeas": "Chickpea",
        "mothbeans": "Bajra",
        "mungbean": "Lentil",
        "blackgram": "Lentil",
    }

    def _decode_crop_label(class_id):
        # Handles both integer-encoded classes and raw string classes.
        raw = None
        if label_encoder is not None:
            try:
                raw = label_encoder.inverse_transform([int(class_id)])[0]
            except Exception:
                raw = None
        if raw is None:
            raw = str(class_id)
        raw = str(raw).strip()
        mapped = crop_alias.get(raw.lower())
        if mapped:
            return mapped
        return raw.title() if raw and raw == raw.lower() else raw

    model_input = features
    if scaler is not None and hasattr(scaler, "transform"):
        try:
            model_input = scaler.transform(features)
        except Exception as exc:
            print(f"⚠️  scaler transform failed; using raw features: {exc}")

    proba = model.predict_proba(model_input)[0]
    class_ids = np.array(getattr(model, "classes_", np.arange(len(proba))))

    district_crops = []
    if state and district and state in STATE_DISTRICT_CROPS:
        district_map = STATE_DISTRICT_CROPS[state]
        district_lookup = {k.lower().strip(): v for k, v in district_map.items()}
        district_crops = district_lookup.get(district.lower()) or []

    # Boost score for district-suitable crops (stronger than state boost)
    if district_crops:
        for i, class_id in enumerate(class_ids):
            crop_label = _decode_crop_label(class_id)
            if crop_label in district_crops:
                proba[i] *= 1.25

    # Boost score for state-suitable crops
    if state and state in STATE_CROPS:
        state_crops = STATE_CROPS[state]
        for i, class_id in enumerate(class_ids):
            crop_label = _decode_crop_label(class_id)
            if crop_label in state_crops:
                proba[i] *= 1.15  # 15% boost for state-suitable crops

    # Location-priority ranking: when location is selected and we have known
    # allowed crops for that location, only keep those classes in ranking.
    original_proba = proba.copy()
    allowed_location_crops = district_crops or (STATE_CROPS.get(state, []) if state else [])
    if allowed_location_crops:
        allowed_norm = {str(c).strip().lower() for c in allowed_location_crops}
        allowed_indices = []
        for i, class_id in enumerate(class_ids):
            crop_label = _decode_crop_label(class_id)
            if crop_label.strip().lower() in allowed_norm:
                allowed_indices.append(i)

        if allowed_indices:
            mask = np.zeros_like(proba)
            mask[allowed_indices] = 1.0
            proba = proba * mask

            # If all allowed classes ended up zero, keep only allowed classes
            # and distribute fallback score to avoid meaningless all-zero output.
            if proba.sum() == 0:
                allowed_vals = original_proba[allowed_indices]
                if allowed_vals.sum() > 0:
                    proba[allowed_indices] = allowed_vals
                else:
                    proba[allowed_indices] = 1.0

    # ── Season filtering: penalize crops not suitable for the selected season ──
    if season and season in CROP_SEASON:
        season_crops = set(CROP_SEASON[season])
        for i, class_id in enumerate(class_ids):
            crop_label = _decode_crop_label(class_id)
            if crop_label not in season_crops and crop_label not in PERENNIAL_CROPS:
                proba[i] *= 0.05  # 95% penalty for out-of-season crops

    # Renormalize
    total = proba.sum()
    if total > 0:
        proba = proba / total
    top_idx = np.argsort(proba)[::-1][:5]

    predictions = []
    for idx in top_idx:
        class_id = class_ids[idx] if idx < len(class_ids) else idx
        crop_name = _decode_crop_label(class_id)
        diseases = CROP_DISEASES.get(crop_name, [])
        crop_seasons = sorted(CROP_TO_SEASONS.get(crop_name, []))
        predictions.append({
            "crop":       crop_name,
            "confidence": round(float(proba[idx]) * 100, 2),
            "tip":        CROP_TIPS.get(crop_name, ""),
            "tip_hi":     CROP_TIPS_HI.get(crop_name, ""),
            "diseases":   diseases[:3],
            "msp":        MSP_DATA.get(crop_name, 0),
            "seasons":    crop_seasons,
        })

    debug_input = {col: float(features[0][i]) for i, col in enumerate(feature_columns)}

    # ── Save to prediction_history if user is logged in ──
    try:
        user = session.get("user")
        if user:
            conn_h = get_db()
            u_row = conn_h.execute("SELECT id FROM users WHERE username=?", (user["username"],)).fetchone()
            if u_row:
                conn_h.execute(
                    """INSERT INTO prediction_history
                       (user_id, state, district, season, input_data, top_crop, confidence, all_predictions)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (
                        u_row["id"],
                        state or "",
                        district or "",
                        season or "",
                        json.dumps(debug_input),
                        predictions[0]["crop"] if predictions else "",
                        predictions[0]["confidence"] if predictions else 0,
                        json.dumps(predictions),
                    ),
                )
                conn_h.commit()
            conn_h.close()
    except Exception:
        pass  # Don't break prediction if history save fails

    # ── Soil moisture advisory (not a model feature, but useful for farmer) ──
    moisture_advisory = None
    if soil_moisture is not None:
        if soil_moisture < 20:
            moisture_advisory = {
                "level": "danger",
                "msg": f"Soil moisture is very low ({soil_moisture:.0f}%). Irrigate before sowing!",
                "msg_hi": f"मिट्टी की नमी बहुत कम है ({soil_moisture:.0f}%)। बुवाई से पहले सिंचाई करें!",
            }
        elif soil_moisture < 35:
            moisture_advisory = {
                "level": "warning",
                "msg": f"Soil moisture is low ({soil_moisture:.0f}%). Consider irrigating soon.",
                "msg_hi": f"मिट्टी की नमी कम है ({soil_moisture:.0f}%)। जल्द सिंचाई करें।",
            }
        elif soil_moisture > 85:
            moisture_advisory = {
                "level": "warning",
                "msg": f"Soil is waterlogged ({soil_moisture:.0f}%). Ensure drainage before planting.",
                "msg_hi": f"मिट्टी जलभराव ({soil_moisture:.0f}%) है। बुवाई से पहले जल निकासी सुनिश्चित करें।",
            }
        else:
            moisture_advisory = {
                "level": "success",
                "msg": f"Soil moisture is good ({soil_moisture:.0f}%). Ready for sowing.",
                "msg_hi": f"मिट्टी की नमी अच्छी है ({soil_moisture:.0f}%)। बुवाई के लिए तैयार।",
            }

    return jsonify(
        success=True,
        predictions=predictions,
        state=state,
        district=district,
        season=season,
        soil_moisture=soil_moisture,
        moisture_advisory=moisture_advisory,
        feature_columns=feature_columns,
        input_used=debug_input,
    )


# ── Prediction History API ───────────────────────────────────────────────────
@app.route("/api/predictions/history")
def api_prediction_history():
    user = session.get("user")
    if not user:
        return jsonify(success=False, error="Not logged in"), 401
    conn = get_db()
    u_row = conn.execute("SELECT id FROM users WHERE username=?", (user["username"],)).fetchone()
    if not u_row:
        conn.close()
        return jsonify(success=False, error="User not found"), 404
    rows = conn.execute(
        """SELECT id, state, district, season, input_data, top_crop, confidence,
                  all_predictions, created_at
           FROM prediction_history WHERE user_id=? ORDER BY created_at DESC LIMIT 10""",
        (u_row["id"],),
    ).fetchall()
    conn.close()
    history = []
    for r in rows:
        history.append({
            "id": r["id"],
            "state": r["state"],
            "district": r["district"],
            "season": r["season"],
            "input_data": json.loads(r["input_data"]) if r["input_data"] else {},
            "top_crop": r["top_crop"],
            "confidence": r["confidence"],
            "all_predictions": json.loads(r["all_predictions"]) if r["all_predictions"] else [],
            "created_at": r["created_at"],
        })
    return jsonify(success=True, history=history)


# ── State crops API ──────────────────────────────────────────────────────────
@app.route("/api/state-crops")
def api_state_crops():
    state = request.args.get("state", "")
    if state in STATE_CROPS:
        return jsonify(success=True, state=state, crops=STATE_CROPS[state])
    return jsonify(success=True, states=list(STATE_CROPS.keys()))


@app.route("/api/state-districts")
def api_state_districts():
    state = request.args.get("state", "").strip()
    if not state:
        return jsonify(success=True, states=list(STATE_DISTRICT_CROPS.keys()))

    district_map = STATE_DISTRICT_CROPS.get(state, {})
    return jsonify(success=True, state=state, districts=sorted(district_map.keys()))


@app.route("/api/model/info")
def api_model_info():
    return jsonify(success=True, active=ACTIVE_CROP_MODEL_FILES, feature_columns=feature_columns)


@app.route("/api/model/reload", methods=["POST"])
def api_model_reload():
    data = request.get_json(silent=True) or {}
    try:
        loaded_paths = load_crop_artifacts(
            model_file=data.get("model"),
            scaler_file=data.get("scaler"),
            label_encoder_file=data.get("label_encoder"),
        )
        load_crop_metadata()
        return jsonify(success=True, message="Crop model reloaded", files=loaded_paths)
    except Exception as exc:
        return jsonify(success=False, error=f"Failed to reload crop model: {exc}"), 400


# ── Weather API (wttr.in – no key required) ──────────────────────────────────
@app.route("/api/weather")
def api_weather():
    city = request.args.get("city", "Delhi")
    try:
        resp = http_requests.get(
            f"https://wttr.in/{city}?format=j1",
            headers={"User-Agent": "KisanSalahkar/2.0"},
            timeout=10,
        )
        resp.raise_for_status()
        w = resp.json()

        current = w["current_condition"][0]
        forecast = []
        for day in w.get("weather", [])[:3]:
            forecast.append({
                "date":     day["date"],
                "maxTemp":  day["maxtempC"],
                "minTemp":  day["mintempC"],
                "desc":     day["hourly"][4]["weatherDesc"][0]["value"],
                "humidity": day["hourly"][4]["humidity"],
            })

        # Farming advisory based on weather
        temp = int(current["temp_C"])
        humidity = int(current["humidity"])
        advisory = []
        if temp > 40:
            advisory.append("Extreme heat! Irrigate crops in evening. Use mulch to protect roots.")
        elif temp > 35:
            advisory.append("High temperature. Increase irrigation frequency. Avoid mid-day spraying.")
        if humidity > 85:
            advisory.append("High humidity — watch for fungal diseases. Ensure proper drainage.")
        if humidity < 30:
            advisory.append("Low humidity — increase irrigation. Consider sprinkler for humidity-loving crops.")

        # ── 7-day forecast from Open-Meteo (free, no key) ──
        forecast7 = []
        try:
            geo_r = http_requests.get(
                f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en",
                timeout=5,
            )
            geo = geo_r.json().get("results", [])
            if geo:
                lat, lon = geo[0]["latitude"], geo[0]["longitude"]
                met_r = http_requests.get(
                    f"https://api.open-meteo.com/v1/forecast?"
                    f"latitude={lat}&longitude={lon}"
                    f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,"
                    f"precipitation_probability_max,weathercode,windspeed_10m_max,uv_index_max"
                    f"&timezone=auto&forecast_days=7",
                    timeout=8,
                )
                met = met_r.json().get("daily", {})
                dates = met.get("time", [])
                for i, dt in enumerate(dates):
                    forecast7.append({
                        "date": dt,
                        "maxTemp": met.get("temperature_2m_max", [None])[i],
                        "minTemp": met.get("temperature_2m_min", [None])[i],
                        "rain": met.get("precipitation_sum", [0])[i],
                        "rainProb": met.get("precipitation_probability_max", [0])[i],
                        "weatherCode": met.get("weathercode", [0])[i],
                        "windMax": met.get("windspeed_10m_max", [0])[i],
                        "uvMax": met.get("uv_index_max", [0])[i],
                    })
        except Exception:
            pass  # 7-day forecast is optional; fall back to 3-day

        return jsonify(success=True, current={
            "temp":      current["temp_C"],
            "feelsLike": current["FeelsLikeC"],
            "humidity":  current["humidity"],
            "desc":      current["weatherDesc"][0]["value"],
            "windSpeed": current["windspeedKmph"],
            "windDir":   current["winddir16Point"],
            "pressure":  current["pressure"],
            "visibility":current["visibility"],
            "uv":        current.get("uvIndex", "N/A"),
        }, forecast=forecast, forecast7=forecast7, city=city, advisory=advisory)
    except Exception as exc:
        return jsonify(success=False, error=str(exc)), 502


# ── Rainfall Estimation API ──────────────────────────────────────────────────
@app.route("/api/rainfall/estimate")
def api_rainfall_estimate():
    """Estimate seasonal rainfall for a given state + season.
    Optionally cross-checks with live wttr.in precipitation forecast."""
    state = request.args.get("state", "").strip()
    season = request.args.get("season", "").strip().lower()
    district = request.args.get("district", "").strip()

    if not state:
        return jsonify(success=False, error="State is required"), 400

    # Auto-detect season from current month if not provided
    if not season:
        month = datetime.now().month
        if month in (6, 7, 8, 9, 10):
            season = "kharif"
        elif month in (11, 12, 1, 2, 3):
            season = "rabi"
        else:
            season = "zaid"

    # Lookup base rainfall from state data
    state_data = STATE_RAINFALL.get(state)
    if not state_data:
        return jsonify(success=False, error=f"No rainfall data for state: {state}"), 404

    base_rainfall = state_data.get(season)
    if base_rainfall is None:
        return jsonify(success=False, error=f"No rainfall data for season: {season}"), 404

    result = {
        "rainfall": base_rainfall,
        "state": state,
        "season": season,
        "source": "historical_avg",
        "unit": "mm/season",
    }
    if district:
        result["district"] = district

    # Try to refine with live weather data from wttr.in
    try:
        location = f"{district}, {state}" if district else state
        resp = http_requests.get(
            f"https://wttr.in/{location}?format=j1",
            headers={"User-Agent": "KisanSalahkar/2.0"},
            timeout=5,
        )
        if resp.status_code == 200:
            w = resp.json()
            # Sum precipitation from 3-day forecast as a daily rate
            total_precip = 0
            days = 0
            for day in w.get("weather", [])[:3]:
                for hour in day.get("hourly", []):
                    total_precip += float(hour.get("precipMM", 0))
                days += 1
            if days > 0:
                daily_avg = total_precip / days
                # Estimate seasonal rainfall: daily_avg × days_in_season
                season_days = {"kharif": 150, "rabi": 150, "zaid": 90}
                live_estimate = int(daily_avg * season_days.get(season, 120))
                # Blend: 60% historical + 40% live estimate for better accuracy
                blended = int(0.6 * base_rainfall + 0.4 * live_estimate)
                result["rainfall"] = blended
                result["source"] = "historical+live"
                result["live_daily_avg_mm"] = round(daily_avg, 1)
    except Exception:
        pass  # Fallback to historical data silently

    return jsonify(success=True, **result)


# ── Soil Testing APIs ────────────────────────────────────────────────────────
@app.route("/api/soil/submit", methods=["POST"])
def api_soil_submit():
    """Submit soil test data manually or simulate a report lookup."""
    data = request.get_json(force=True)
    report_id = data.get("report_id", "").strip()

    if report_id:
        # Lookup existing report
        conn = get_db()
        row = conn.execute("SELECT * FROM soil_reports WHERE report_id = ?", (report_id,)).fetchone()
        conn.close()
        if row:
            return jsonify(success=True, report=dict(row))
        return jsonify(success=False, error="Report not found. Please enter data manually."), 404

    # Manual entry — save and analyze
    report_id = f"SHC-{uuid.uuid4().hex[:8].upper()}"
    user_id = 0
    if "user" in session:
        conn2 = get_db()
        u = conn2.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
        if u: user_id = u["id"]
        conn2.close()

    conn = get_db()
    conn.execute("""
        INSERT INTO soil_reports (report_id, user_id, N, P, K, pH, EC, OC, S, Zn, Fe, Mn, Cu, B, soil_type, location, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        report_id, user_id,
        data.get("N", 0), data.get("P", 0), data.get("K", 0),
        data.get("pH", 0), data.get("EC", 0), data.get("OC", 0),
        data.get("S", 0), data.get("Zn", 0), data.get("Fe", 0),
        data.get("Mn", 0), data.get("Cu", 0), data.get("B", 0),
        data.get("soil_type", ""), data.get("location", ""), data.get("state", ""),
    ))
    conn.commit()
    conn.close()

    # Generate recommendations
    n, p, k, ph = float(data.get("N",0)), float(data.get("P",0)), float(data.get("K",0)), float(data.get("pH",6.5))
    recs = []
    if n < 250: recs.append({"nutrient": "Nitrogen", "status": "Low", "action": f"Apply {int(280-n)} kg Urea/ha"})
    elif n > 500: recs.append({"nutrient": "Nitrogen", "status": "High", "action": "Reduce nitrogen fertiliser"})
    else: recs.append({"nutrient": "Nitrogen", "status": "Medium", "action": "Maintain current application"})

    if p < 10: recs.append({"nutrient": "Phosphorus", "status": "Low", "action": "Apply 60 kg DAP/ha"})
    elif p > 25: recs.append({"nutrient": "Phosphorus", "status": "High", "action": "Skip P this season"})
    else: recs.append({"nutrient": "Phosphorus", "status": "Medium", "action": "Apply 30 kg DAP/ha"})

    if k < 120: recs.append({"nutrient": "Potassium", "status": "Low", "action": "Apply 50 kg MOP/ha"})
    elif k > 280: recs.append({"nutrient": "Potassium", "status": "High", "action": "Skip K this season"})
    else: recs.append({"nutrient": "Potassium", "status": "Medium", "action": "Apply 25 kg MOP/ha"})

    if ph < 5.5: recs.append({"nutrient": "pH", "status": "Acidic", "action": "Apply 2-4 quintal lime/ha"})
    elif ph > 8.0: recs.append({"nutrient": "pH", "status": "Alkaline", "action": "Apply 5 quintal gypsum/ha"})
    else: recs.append({"nutrient": "pH", "status": "Normal", "action": "pH is in ideal range"})

    return jsonify(success=True, report_id=report_id, recommendations=recs)


# ── Government Scheme Eligibility API ────────────────────────────────────────
@app.route("/api/schemes/check", methods=["POST"])
def api_schemes_check():
    data = request.get_json(force=True)
    land_ha = float(data.get("land_ha", 0))
    category = data.get("category", "all").lower()  # small, marginal, all
    state = data.get("state", "")

    eligible = []
    for scheme in GOVT_SCHEMES:
        elig = scheme["eligibility"]
        if land_ha <= elig["land_max_ha"]:
            if "all" in elig["categories"] or category in elig["categories"]:
                eligible.append({
                    "id": scheme["id"],
                    "name": scheme["name"],
                    "name_hi": scheme["name_hi"],
                    "desc": scheme["desc"],
                    "desc_hi": scheme["desc_hi"],
                    "benefits": scheme["benefits"],
                    "url": scheme["url"],
                })

    return jsonify(success=True, eligible=eligible, total=len(eligible))


@app.route("/api/schemes")
def api_schemes():
    return jsonify(success=True, schemes=GOVT_SCHEMES)


# ── Mandi Prices API (live from data.gov.in + fallback) ──────────────────────
@app.route("/api/mandi")
def api_mandi():
    crop     = request.args.get("crop", "").strip()
    state    = request.args.get("state", "").strip()
    district = request.args.get("district", "").strip()
    market   = request.args.get("market", "").strip()

    # ── Detail view: specific crop ───────────────────────────────────────
    if crop:
        msp = MSP_DATA.get(crop, 0)
        live = fetch_mandi_from_gov(crop, state, district, market, limit=500)

        if live and live["records"]:
            mandis = []
            seen_states, seen_districts, seen_markets = set(), set(), set()
            for r in live["records"]:
                mandis.append({
                    "name":      r["market"],
                    "state":     r["state"],
                    "district":  r["district"],
                    "variety":   r["variety"],
                    "commodity": r["commodity"],
                    "price":     r["modal_price"],
                    "min_price": r["min_price"],
                    "max_price": r["max_price"],
                    "date":      r["date"],
                })
                seen_states.add(r["state"])
                seen_districts.add(r["district"])
                seen_markets.add(r["market"])

            prices = [m["price"] for m in mandis if m["price"]]
            avg_price = round(sum(prices) / len(prices)) if prices else 0
            min_price = min(prices) if prices else 0
            max_price = max(prices) if prices else 0

            return jsonify(
                success=True, live=True, crop=crop, msp=msp,
                unit="quintal", mandis=mandis,
                fetched_at=live["fetched_at"],
                total_records=live["total"],
                avg_price=avg_price, min_price=min_price, max_price=max_price,
                available_states=sorted(seen_states),
                available_districts=sorted(seen_districts),
                available_markets=sorted(seen_markets),
            )

        # Fallback
        fb = MANDI_FALLBACK.get(crop, [])
        return jsonify(
            success=True, live=False, crop=crop, msp=msp,
            unit="quintal", mandis=fb,
            fetched_at="offline", total_records=len(fb),
            avg_price=0, min_price=0, max_price=0,
            available_states=[], available_districts=[], available_markets=[],
        )

    # ── Overview: all supported crops ────────────────────────────────────
    all_crops = []
    live_data = fetch_mandi_from_gov("", state, district, market, limit=2000)
    is_live = False

    if live_data and live_data["records"]:
        is_live = True
        grouped: dict = {}
        for r in live_data["records"]:
            crop_name = _match_crop_name(r["commodity"])
            if crop_name:
                grouped.setdefault(crop_name, []).append(r)

        for cname in COMMODITY_MAP:
            entries = grouped.get(cname, [])
            if entries:
                prices = [e["modal_price"] for e in entries if e["modal_price"]]
                avg_p = round(sum(prices) / len(prices)) if prices else 0
                num   = len(entries)
            else:
                fb = MANDI_FALLBACK.get(cname, [])
                prices = [m["price"] for m in fb]
                avg_p = round(sum(prices) / len(prices)) if prices else 0
                num   = len(fb)
            all_crops.append({
                "crop": cname, "msp": MSP_DATA.get(cname, 0),
                "unit": "quintal", "avg_price": avg_p, "num_mandis": num,
            })
        fetched_at = live_data["fetched_at"]
    else:
        for cname, fb in MANDI_FALLBACK.items():
            prices = [m["price"] for m in fb]
            avg_p = round(sum(prices) / len(prices)) if prices else 0
            all_crops.append({
                "crop": cname, "msp": MSP_DATA.get(cname, 0),
                "unit": "quintal", "avg_price": avg_p, "num_mandis": len(fb),
            })
        fetched_at = "offline"

    return jsonify(
        success=True, live=is_live, crops=all_crops,
        fetched_at=fetched_at, states=INDIAN_STATES,
    )


@app.route("/api/mandi/districts")
def api_mandi_districts():
    """Get districts for a state from live API data."""
    state = request.args.get("state", "").strip()
    if not state:
        return jsonify(success=False, message="State required")
    data = fetch_mandi_from_gov("", state, "", "", limit=2000)
    districts = set()
    if data and data["records"]:
        for r in data["records"]:
            if r["district"]:
                districts.add(r["district"])
    return jsonify(success=True, state=state, districts=sorted(districts))


@app.route("/api/mandi/markets")
def api_mandi_markets():
    """Get markets for a state+district from live API data."""
    state    = request.args.get("state", "").strip()
    district = request.args.get("district", "").strip()
    if not state:
        return jsonify(success=False, message="State required")
    data = fetch_mandi_from_gov("", state, district, "", limit=2000)
    markets = set()
    if data and data["records"]:
        for r in data["records"]:
            if r["market"]:
                markets.add(r["market"])
    return jsonify(success=True, state=state, district=district, markets=sorted(markets))


@app.route("/api/mandi/nearby")
def api_mandi_nearby():
    """Auto-detect location via IP and return state/district guess + prices."""
    try:
        ip_data = http_requests.get("https://ipapi.co/json/", timeout=5).json()
        region = ip_data.get("region", "")
        city   = ip_data.get("city", "")
        lat    = ip_data.get("latitude", 0)
        lon    = ip_data.get("longitude", 0)

        # Try to match region to our states list
        matched_state = ""
        for s in INDIAN_STATES:
            if s.lower() == region.lower() or region.lower() in s.lower() or s.lower() in region.lower():
                matched_state = s
                break

        # Fetch prices for detected state
        prices_data = None
        if matched_state:
            prices_data = fetch_mandi_from_gov("", matched_state, "", "", limit=500)

        records = []
        if prices_data and prices_data["records"]:
            records = prices_data["records"][:50]   # Limit for nearby view

        return jsonify(
            success=True,
            detected_state=matched_state,
            detected_city=city,
            lat=lat, lon=lon,
            records=records,
            fetched_at=prices_data["fetched_at"] if prices_data else "offline",
        )
    except Exception as exc:
        print(f"[Nearby] {exc}")
        return jsonify(success=False, detected_state="", detected_city="", records=[])


# ── Favorite Mandis API ─────────────────────────────────────────────────────
@app.route("/api/mandi/favorites")
def api_mandi_favorites():
    uid = session.get("user_id")
    if not uid:
        return jsonify(success=False, message="Login required", favorites=[])
    conn = get_db()
    rows = conn.execute(
        "SELECT id, state, district, market, label FROM favorite_mandis WHERE user_id=? ORDER BY created_at DESC", (uid,)
    ).fetchall()
    conn.close()
    favs = [{"id": r[0], "state": r[1], "district": r[2], "market": r[3], "label": r[4]} for r in rows]
    return jsonify(success=True, favorites=favs)


@app.route("/api/mandi/favorites", methods=["POST"])
def api_mandi_favorites_add():
    uid = session.get("user_id")
    if not uid:
        return jsonify(success=False, message="Login required")
    data = request.get_json(force=True)
    state    = data.get("state", "").strip()
    district = data.get("district", "").strip()
    market   = data.get("market", "").strip()
    label    = data.get("label", "").strip() or f"{market}, {district}"
    if not market:
        return jsonify(success=False, message="Market name required")
    try:
        conn = get_db()
        conn.execute(
            "INSERT OR IGNORE INTO favorite_mandis (user_id, state, district, market, label) VALUES (?,?,?,?,?)",
            (uid, state, district, market, label),
        )
        conn.commit()
        conn.close()
        return jsonify(success=True, message="Mandi saved to favorites")
    except Exception as exc:
        return jsonify(success=False, message=str(exc))


@app.route("/api/mandi/favorites/<int:fav_id>", methods=["DELETE"])
def api_mandi_favorites_del(fav_id):
    uid = session.get("user_id")
    if not uid:
        return jsonify(success=False, message="Login required")
    conn = get_db()
    conn.execute("DELETE FROM favorite_mandis WHERE id=? AND user_id=?", (fav_id, uid))
    conn.commit()
    conn.close()
    return jsonify(success=True, message="Removed")


@app.route("/api/mandi/refresh")
def api_mandi_refresh():
    """Clear mandi cache so next request pulls fresh data."""
    _mandi_cache.clear()
    return jsonify(success=True, message="Cache cleared")


# ── Disease Detection API ────────────────────────────────────────────────────
@app.route("/api/disease/detect", methods=["POST"])
def api_disease_detect():
    """Accept image or description and return disease diagnosis.
    If CNN model is loaded AND image is provided → CNN prediction.
    Otherwise → text-based keyword matching (fallback).
    """
    data = request.get_json(force=True)
    image_data = data.get("image", "")
    symptoms_text = data.get("symptoms", "").lower()
    crop_name = data.get("crop", "").strip()

    results = []
    used_cnn = False

    # ── CNN Image-based detection (primary) ──
    if image_data and DISEASE_MODEL and DISEASE_LABELS:
        try:
            import tensorflow as tf

            # Decode base64 image
            if "," in image_data:
                image_data = image_data.split(",")[1]  # Remove data:image/...;base64, prefix

            img_bytes = base64.b64decode(image_data)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            img = img.resize((DISEASE_IMG_SIZE, DISEASE_IMG_SIZE))

            # Preprocess for MobileNetV2
            img_array = np.array(img, dtype=np.float32)
            img_array = np.expand_dims(img_array, axis=0)  # Add batch dimension

            # Predict (Keras or TFLite)
            if DISEASE_USE_TFLITE:
                input_details = DISEASE_MODEL.get_input_details()
                output_details = DISEASE_MODEL.get_output_details()
                # TFLite expects [0,1] float or uint8 — apply simple scaling
                img_array = img_array / 127.5 - 1.0
                DISEASE_MODEL.set_tensor(input_details[0]['index'], img_array.astype(np.float32))
                DISEASE_MODEL.invoke()
                predictions = DISEASE_MODEL.get_tensor(output_details[0]['index'])[0]
            else:
                import tensorflow as tf
                img_array = tf.keras.applications.mobilenet_v2.preprocess_input(img_array)
                predictions = DISEASE_MODEL.predict(img_array, verbose=0)[0]

            # Get top 5 predictions
            top_indices = np.argsort(predictions)[::-1][:5]

            for idx in top_indices:
                idx_str = str(idx)
                if idx_str not in DISEASE_LABELS:
                    continue
                label = DISEASE_LABELS[idx_str]
                confidence = float(predictions[idx]) * 100

                if confidence < 5:  # Skip very low confidence
                    continue

                # Filter by crop if specified
                if crop_name and crop_name.lower() not in label.get("crop", "").lower():
                    # Still include but lower confidence
                    confidence *= 0.5

                severity = "low"
                if not label.get("is_healthy", False):
                    if confidence > 70: severity = "high"
                    elif confidence > 40: severity = "medium"

                results.append({
                    "disease": label["en"],
                    "disease_hi": label["hi"],
                    "crop": label.get("crop", "Unknown"),
                    "type": "CNN Detection",
                    "symptoms": "",
                    "symptoms_hi": "",
                    "treatment": label.get("treatment_en", "Consult your local agricultural extension officer."),
                    "treatment_hi": label.get("treatment_hi", "अपने स्थानीय कृषि विस्तार अधिकारी से संपर्क करें।"),
                    "severity": severity if not label.get("is_healthy") else "none",
                    "confidence": round(confidence, 1),
                    "is_healthy": label.get("is_healthy", False),
                    "source": "cnn",
                })

            used_cnn = True
            print(f"🔬 CNN prediction: {results[0]['disease']} ({results[0]['confidence']:.1f}%)" if results else "🔬 CNN: no confident match")

        except Exception as e:
            print(f"⚠️ CNN prediction error: {e}")
            used_cnn = False

    # ── Text-based detection (fallback or supplement) ──
    if not used_cnn or (symptoms_text and not results):
        text_results = []
        if symptoms_text:
            for disease_name, info in DISEASE_DB.items():
                score = 0
                keywords = info["symptoms"].lower().split()
                for word in symptoms_text.split():
                    if word in " ".join(keywords):
                        score += 1
                if crop_name and crop_name.lower() in info["crop"].lower():
                    score += 3
                if score > 0:
                    text_results.append({
                        "disease": disease_name,
                        "disease_hi": "",
                        "crop": info["crop"],
                        "type": info["type"],
                        "symptoms": info["symptoms"],
                        "symptoms_hi": info["symptoms_hi"],
                        "treatment": info["treatment"],
                        "treatment_hi": info["treatment_hi"],
                        "severity": info["severity"],
                        "confidence": min(95, score * 15 + 40),
                        "is_healthy": False,
                        "source": "text",
                    })

        if not text_results:
            for disease_name, info in DISEASE_DB.items():
                if not crop_name or crop_name.lower() in info["crop"].lower():
                    text_results.append({
                        "disease": disease_name,
                        "disease_hi": "",
                        "crop": info["crop"],
                        "type": info["type"],
                        "symptoms": info["symptoms"],
                        "symptoms_hi": info["symptoms_hi"],
                        "treatment": info["treatment"],
                        "treatment_hi": info["treatment_hi"],
                        "severity": info["severity"],
                        "confidence": 60,
                        "is_healthy": False,
                        "source": "text",
                    })

        # If CNN gave results, add text results only if they're different
        if results:
            existing_names = {r["disease"].lower() for r in results}
            for tr in text_results:
                if tr["disease"].lower() not in existing_names:
                    results.append(tr)
        else:
            results = text_results

    results.sort(key=lambda x: x["confidence"], reverse=True)
    return jsonify(
        success=True,
        diseases=results[:5],
        model_used="cnn" if used_cnn else "text",
        cnn_available=DISEASE_MODEL is not None,
    )


@app.route("/api/disease/list")
def api_disease_list():
    crop = request.args.get("crop", "")
    if crop and crop in CROP_DISEASES:
        return jsonify(success=True, crop=crop, diseases=CROP_DISEASES[crop])
    return jsonify(success=True, all_diseases=CROP_DISEASES)


# ── Community Forum APIs ─────────────────────────────────────────────────────
@app.route("/api/forum/posts")
def api_forum_posts():
    category = request.args.get("category", "")
    conn = get_db()
    if category:
        posts = conn.execute(
            "SELECT * FROM forum_posts WHERE category = ? ORDER BY created_at DESC LIMIT 50",
            (category,)
        ).fetchall()
    else:
        posts = conn.execute(
            "SELECT * FROM forum_posts ORDER BY created_at DESC LIMIT 50"
        ).fetchall()

    result = []
    for p in posts:
        replies = conn.execute(
            "SELECT COUNT(*) as cnt FROM forum_replies WHERE post_id = ?", (p["id"],)
        ).fetchone()
        result.append({
            "id": p["id"], "username": p["username"], "title": p["title"],
            "content": p["content"], "category": p["category"],
            "likes": p["likes"], "replies": replies["cnt"],
            "created_at": p["created_at"],
        })
    conn.close()
    return jsonify(success=True, posts=result)

@app.route("/api/forum/post", methods=["POST"])
def api_forum_create_post():
    if "user" not in session:
        return jsonify(success=False, error="Login required"), 401
    data = request.get_json(force=True)
    title = sanitize(data.get("title", "").strip())
    content = sanitize(data.get("content", "").strip())
    category = sanitize(data.get("category", "general"))

    if not title or not content:
        return jsonify(success=False, error="Title and content required"), 400

    conn = get_db()
    u = conn.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    user_id = u["id"] if u else 0
    conn.execute(
        "INSERT INTO forum_posts (user_id, username, title, content, category) VALUES (?, ?, ?, ?, ?)",
        (user_id, session["user"]["name"], title, content, category)
    )
    conn.commit()
    conn.close()
    return jsonify(success=True)

@app.route("/api/forum/reply", methods=["POST"])
def api_forum_reply():
    if "user" not in session:
        return jsonify(success=False, error="Login required"), 401
    data = request.get_json(force=True)
    post_id = data.get("post_id")
    content = sanitize(data.get("content", "").strip())

    if not content:
        return jsonify(success=False, error="Reply content required"), 400

    conn = get_db()
    u = conn.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    user_id = u["id"] if u else 0
    conn.execute(
        "INSERT INTO forum_replies (post_id, user_id, username, content) VALUES (?, ?, ?, ?)",
        (post_id, user_id, session["user"]["name"], content)
    )
    conn.commit()

    # Notify original post author about the reply
    post = conn.execute("SELECT user_id, title FROM forum_posts WHERE id=?", (post_id,)).fetchone()
    if post and post["user_id"] != user_id:
        preview = content[:60] + ("..." if len(content) > 60 else "")
        _notify(post["user_id"], "forum",
                f"💬 Reply on your post",
                f"{session['user']['name']} replied: {preview}",
                "/forum")

    replies = conn.execute(
        "SELECT * FROM forum_replies WHERE post_id = ? ORDER BY created_at ASC", (post_id,)
    ).fetchall()
    conn.close()

    return jsonify(success=True, replies=[dict(r) for r in replies])

@app.route("/api/forum/like", methods=["POST"])
def api_forum_like():
    data = request.get_json(force=True)
    post_id = data.get("post_id")
    conn = get_db()
    conn.execute("UPDATE forum_posts SET likes = likes + 1 WHERE id = ?", (post_id,))
    conn.commit()
    conn.close()
    return jsonify(success=True)


# ── SMS Alert APIs ───────────────────────────────────────────────────────────
@app.route("/api/alerts/subscribe", methods=["POST"])
def api_alerts_subscribe():
    if "user" not in session:
        return jsonify(success=False, error="Login required"), 401
    data = request.get_json(force=True)
    phone = data.get("phone", "").strip()
    alert_type = data.get("alert_type", "all")
    city = data.get("city", "").strip()

    if not phone or len(phone) < 10:
        return jsonify(success=False, error="Valid phone number required"), 400

    conn = get_db()
    u = conn.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    user_id = u["id"] if u else 0

    # Update user phone
    conn.execute("UPDATE users SET phone=? WHERE id=?", (phone, user_id))

    conn.execute(
        "INSERT INTO sms_subscriptions (user_id, phone, alert_type, city) VALUES (?, ?, ?, ?)",
        (user_id, phone, alert_type, city)
    )
    conn.commit()
    conn.close()
    return jsonify(success=True, message="Alert subscription active! You will receive weather & crop alerts.")

@app.route("/api/alerts/status")
def api_alerts_status():
    if "user" not in session:
        return jsonify(success=False), 401
    conn = get_db()
    u = conn.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not u:
        conn.close()
        return jsonify(success=True, subscriptions=[])
    subs = conn.execute("SELECT * FROM sms_subscriptions WHERE user_id=? AND active=1", (u["id"],)).fetchall()
    conn.close()
    return jsonify(success=True, subscriptions=[dict(s) for s in subs])

@app.route("/api/alerts/unsubscribe", methods=["POST"])
def api_alerts_unsubscribe():
    data = request.get_json(force=True)
    sub_id = data.get("id")
    conn = get_db()
    conn.execute("UPDATE sms_subscriptions SET active=0 WHERE id=?", (sub_id,))
    conn.commit()
    conn.close()
    return jsonify(success=True)


# ── IoT Sensor APIs ──────────────────────────────────────────────────────────
IOT_API_KEY = os.environ.get("IOT_API_KEY", "kisan-iot-2026")

# Sensor thresholds for alerts
SENSOR_THRESHOLDS = {
    "moisture_low": 25,      # Below 25% → irrigate
    "moisture_high": 85,     # Above 85% → waterlogged
    "temp_high": 42,         # Heat stress
    "temp_low": 4,           # Frost risk
    "ph_low": 4.5,           # Too acidic
    "ph_high": 8.5,          # Too alkaline
    "humidity_high": 90,     # Fungal disease risk
    "battery_low": 6.0,      # Battery needs charging
}


@app.route("/api/sensor/push", methods=["POST"])
def api_sensor_push():
    """Receive sensor data from ESP32 via WiFi."""
    data = request.get_json(force=True)

    # Validate API key
    if data.get("api_key") != IOT_API_KEY:
        return jsonify(success=False, error="Invalid API key"), 403

    device_id   = data.get("device_id", "unknown")
    temperature = float(data.get("temperature", 0))
    humidity    = float(data.get("humidity", 0))
    moisture    = float(data.get("moisture", 0))
    ph          = float(data.get("ph", 0))
    battery_v   = float(data.get("battery_v", 0))
    wifi_rssi   = int(data.get("wifi_rssi", 0))
    moisture_raw = int(data.get("moisture_raw", 0))
    ph_raw       = int(data.get("ph_raw", 0))
    ph_voltage   = float(data.get("ph_voltage", 0))

    # Reject invalid readings (sensor error values)
    if temperature == -999 or humidity == -999:
        return jsonify(success=False, error="Invalid sensor reading"), 400

    # Handle disconnected sensors: ESP32 sends -1 (unplugged) or -2 (probe in air)
    ph_in_air = (ph == -2)
    if moisture < 0:
        moisture = None
    if ph < 0:
        ph = None

    # Store in database
    conn = get_db()
    conn.execute(
        """INSERT INTO sensor_readings
           (device_id, temperature, humidity, moisture, ph,
            moisture_raw, ph_raw, ph_voltage, battery_v, wifi_rssi)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (device_id, temperature, humidity, moisture, ph,
         moisture_raw, ph_raw, ph_voltage, battery_v, wifi_rssi)
    )
    conn.commit()
    conn.close()

    # Check thresholds and generate alerts
    alerts = []
    if moisture is not None:
        if moisture < SENSOR_THRESHOLDS["moisture_low"]:
            alerts.append(f"⚠️ Soil moisture LOW ({moisture:.0f}%) — irrigate now!")
        if moisture > SENSOR_THRESHOLDS["moisture_high"]:
            alerts.append(f"⚠️ Soil moisture HIGH ({moisture:.0f}%) — possible waterlogging!")
    else:
        alerts.append("🔌 Soil moisture sensor not connected (check GPIO 34 wiring)")
    if temperature > SENSOR_THRESHOLDS["temp_high"]:
        alerts.append(f"🔥 Extreme heat ({temperature:.1f}°C) — protect crops!")
    if temperature < SENSOR_THRESHOLDS["temp_low"]:
        alerts.append(f"❄️ Frost risk ({temperature:.1f}°C) — cover saplings!")
    if ph is not None:
        if ph < SENSOR_THRESHOLDS["ph_low"]:
            alerts.append(f"⚗️ Soil too acidic (pH {ph:.1f}) — apply lime")
        if ph > SENSOR_THRESHOLDS["ph_high"]:
            alerts.append(f"⚗️ Soil too alkaline (pH {ph:.1f}) — apply gypsum")
    elif ph_in_air:
        alerts.append("🌬️ pH probe is in air — dip it in soil or water for a reading")
    else:
        alerts.append("🔌 pH sensor not connected (check GPIO 35 wiring)")
    if humidity > SENSOR_THRESHOLDS["humidity_high"]:
        alerts.append(f"🍄 High humidity ({humidity:.0f}%) — fungal disease risk!")
    if battery_v > 0 and battery_v < SENSOR_THRESHOLDS["battery_low"]:
        alerts.append(f"🔋 Battery low ({battery_v:.1f}V) — recharge soon")

    return jsonify(
        success=True,
        message="Data received",
        device_id=device_id,
        alerts=alerts
    )


@app.route("/api/sensor/latest")
def api_sensor_latest():
    """Get the most recent sensor reading (for dashboard auto-refresh)."""
    device_id = request.args.get("device_id", "ESP32-FARM-001")
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM sensor_readings WHERE device_id=? ORDER BY created_at DESC LIMIT 1",
        (device_id,)
    ).fetchone()
    conn.close()

    if not row:
        return jsonify(success=False, error="No sensor data yet. Connect your ESP32."), 404

    reading = dict(row)

    # ── Staleness check: is the ESP32 still actively sending data? ──
    # ESP32 sends every 10s, so >30s of silence = device offline
    # NOTE: SQLite CURRENT_TIMESTAMP stores UTC, so compare with UTC
    STALE_SECONDS = 30
    created_str = reading.get("created_at", "")
    try:
        last_ts = datetime.strptime(created_str, "%Y-%m-%d %H:%M:%S")
        age_seconds = (datetime.utcnow() - last_ts).total_seconds()
    except (ValueError, TypeError):
        age_seconds = 99999  # treat parse errors as stale
    reading["device_online"] = age_seconds <= STALE_SECONDS
    reading["data_age_seconds"] = int(age_seconds)

    # Generate real-time advisories based on sensor data
    advisories = []
    m = reading["moisture"]
    t = reading["temperature"]
    h = reading["humidity"]
    p = reading["ph"]

    # Sensor disconnected detection (NULL in DB = sensor sent -1 or -2)
    moisture_connected = m is not None
    ph_connected = p is not None
    # Distinguish "module unplugged" vs "probe in air":
    # If pH is NULL but ph_raw > 50, the module is connected but probe is in air
    ph_in_air = (not ph_connected) and (reading.get("ph_raw") or 0) > 50
    if m is None:
        m = 0  # default for display
        reading["moisture"] = 0
    if p is None:
        p = 7.0  # neutral default for display
        reading["ph"] = 7.0

    # Add raw debug info to reading
    reading["moisture_connected"] = moisture_connected
    reading["ph_connected"] = ph_connected
    reading["ph_in_air"] = ph_in_air

    if not moisture_connected:
        advisories.append({"type": "warning", "icon": "plug-circle-exclamation", "msg": f"Soil moisture sensor not connected (raw ADC: {reading.get('moisture_raw', 0)}). Check GPIO 34 wiring.", "msg_hi": f"मिट्टी नमी सेंसर कनेक्ट नहीं है (raw ADC: {reading.get('moisture_raw', 0)})। GPIO 34 वायरिंग जांचें।"})
    elif m < 25:
        advisories.append({"type": "danger", "icon": "droplet-slash", "msg": f"Soil moisture critically low ({m:.0f}%). Irrigate immediately!", "msg_hi": f"मिट्टी की नमी बहुत कम ({m:.0f}%)। तुरंत सिंचाई करें!"})
    elif m < 40:
        advisories.append({"type": "warning", "icon": "droplet", "msg": f"Soil moisture low ({m:.0f}%). Consider irrigating today.", "msg_hi": f"मिट्टी की नमी कम ({m:.0f}%)। आज सिंचाई करें।"})
    elif m > 85:
        advisories.append({"type": "warning", "icon": "water", "msg": f"Soil too wet ({m:.0f}%). Ensure proper drainage.", "msg_hi": f"मिट्टी बहुत गीली ({m:.0f}%)। जल निकासी सुनिश्चित करें।"})
    else:
        advisories.append({"type": "success", "icon": "check-circle", "msg": f"Soil moisture optimal ({m:.0f}%). No irrigation needed.", "msg_hi": f"मिट्टी की नमी सही ({m:.0f}%)। सिंचाई की ज़रूरत नहीं।"})

    if t > 40:
        advisories.append({"type": "danger", "icon": "temperature-high", "msg": f"Extreme heat ({t:.1f}°C). Use mulch, irrigate in evening.", "msg_hi": f"भीषण गर्मी ({t:.1f}°C)। मल्चिंग करें, शाम को सिंचाई।"})
    elif t < 5:
        advisories.append({"type": "danger", "icon": "snowflake", "msg": f"Frost risk ({t:.1f}°C). Cover sensitive crops.", "msg_hi": f"पाला पड़ने का खतरा ({t:.1f}°C)। संवेदनशील फसलें ढकें।"})

    if h > 85:
        advisories.append({"type": "warning", "icon": "virus", "msg": f"High humidity ({h:.0f}%) — fungal disease risk. Avoid spraying.", "msg_hi": f"उच्च आर्द्रता ({h:.0f}%) — फफूंद रोग का खतरा। छिड़काव न करें।"})

    if not ph_connected:
        ph_v_display = reading.get('ph_voltage') or 0
        if ph_in_air:
            advisories.append({"type": "warning", "icon": "wind", "msg": "pH probe is in air — dip it in soil or water for a reading.", "msg_hi": "pH प्रोब हवा में है — सही रीडिंग के लिए मिट्टी या पानी में डुबोएं।"})
        else:
            advisories.append({"type": "warning", "icon": "plug-circle-exclamation", "msg": f"pH sensor not connected (raw ADC: {reading.get('ph_raw', 0)}, {ph_v_display:.3f}V). Check GPIO 35 wiring.", "msg_hi": f"pH सेंसर कनेक्ट नहीं है। GPIO 35 वायरिंग जांचें।"})
    elif p < 5.5:
        advisories.append({"type": "warning", "icon": "flask-vial", "msg": f"Soil acidic (pH {p:.1f}). Apply 2-4 q lime/ha.", "msg_hi": f"मिट्टी अम्लीय (pH {p:.1f})। 2-4 क्विंटल चूना/हे. डालें।"})
    elif p > 8.0:
        advisories.append({"type": "warning", "icon": "flask-vial", "msg": f"Soil alkaline (pH {p:.1f}). Apply gypsum.", "msg_hi": f"मिट्टी क्षारीय (pH {p:.1f})। जिप्सम डालें।"})

    reading["advisories"] = advisories
    return jsonify(success=True, reading=reading)


@app.route("/api/sensor/history")
def api_sensor_history():
    """Get sensor reading history for charts (last 24h by default)."""
    device_id = request.args.get("device_id", "ESP32-FARM-001")
    hours = int(request.args.get("hours", 24))

    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM sensor_readings
           WHERE device_id=? AND created_at >= datetime('now', ?)
           ORDER BY created_at ASC""",
        (device_id, f"-{hours} hours")
    ).fetchall()
    conn.close()

    history = [dict(r) for r in rows]
    return jsonify(success=True, history=history, count=len(history))


@app.route("/api/sensor/camera", methods=["POST"])
def api_sensor_camera():
    """Receive image from ESP32-CAM for disease detection.
    If CNN model is loaded, runs prediction automatically.
    """
    data = request.get_json(force=True)

    if data.get("api_key") != IOT_API_KEY:
        return jsonify(success=False, error="Invalid API key"), 403

    device_id  = data.get("device_id", "unknown")
    image_data = data.get("image", "")

    if not image_data:
        return jsonify(success=False, error="No image data"), 400

    diagnosis = "Image received — manual review needed."
    confidence = 0
    treatment = ""

    # Run CNN prediction if model is loaded
    if DISEASE_MODEL and DISEASE_LABELS:
        try:
            import tensorflow as tf

            if "," in image_data:
                image_data_clean = image_data.split(",")[1]
            else:
                image_data_clean = image_data

            img_bytes = base64.b64decode(image_data_clean)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            img = img.resize((DISEASE_IMG_SIZE, DISEASE_IMG_SIZE))

            img_array = np.array(img, dtype=np.float32)
            img_array = np.expand_dims(img_array, axis=0)

            if DISEASE_USE_TFLITE:
                input_details = DISEASE_MODEL.get_input_details()
                output_details = DISEASE_MODEL.get_output_details()
                img_array = img_array / 127.5 - 1.0
                DISEASE_MODEL.set_tensor(input_details[0]['index'], img_array.astype(np.float32))
                DISEASE_MODEL.invoke()
                predictions = DISEASE_MODEL.get_tensor(output_details[0]['index'])[0]
            else:
                img_array = tf.keras.applications.mobilenet_v2.preprocess_input(img_array)
                predictions = DISEASE_MODEL.predict(img_array, verbose=0)[0]
            top_idx = int(np.argmax(predictions))
            confidence = float(predictions[top_idx]) * 100

            label = DISEASE_LABELS.get(str(top_idx), {})
            diagnosis = label.get("en", "Unknown")
            treatment = label.get("treatment_en", "")
            print(f"📸 ESP32-CAM → {diagnosis} ({confidence:.1f}%)")

        except Exception as e:
            print(f"⚠️ Camera CNN error: {e}")
            diagnosis = f"Image received — CNN error: {str(e)[:50]}"

    # Store image capture record
    conn = get_db()
    conn.execute(
        "INSERT INTO sensor_images (device_id, image_data, diagnosis, confidence) VALUES (?, ?, ?, ?)",
        (device_id, image_data[:200] + "...", diagnosis, round(confidence, 1))
    )
    conn.commit()
    conn.close()

    return jsonify(
        success=True,
        message="Image analyzed" if confidence > 0 else "Image received",
        diagnosis=diagnosis,
        confidence=round(confidence, 1),
        treatment=treatment,
    )


@app.route("/api/sensor/autofill")
def api_sensor_autofill():
    """Get latest sensor data formatted for crop prediction form auto-fill."""
    device_id = request.args.get("device_id", "ESP32-FARM-001")
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM sensor_readings WHERE device_id=? ORDER BY created_at DESC LIMIT 1",
        (device_id,)
    ).fetchone()
    conn.close()

    if not row:
        return jsonify(success=False, error="No sensor data available"), 404

    temperature = round(row["temperature"], 1)
    humidity = round(row["humidity"], 1)
    ph = round(row["ph"], 1) if row["ph"] is not None else 7.0
    moisture = round(row["moisture"], 1) if row["moisture"] is not None else 50.0

    # Map sensor readings to crop prediction form fields
    autofill = {
        "ph":          ph,
        "temperature": temperature,
        "humidity":    humidity,
        "moisture":    moisture,
        "timestamp":   row["created_at"],
        "device_id":   row["device_id"],
    }

    # Predict NPK from sensor values using AI model
    if NPK_MODEL and NPK_SCALER:
        try:
            X = np.array([[temperature, humidity, ph, moisture]])
            X_scaled = NPK_SCALER.transform(X)
            pred = NPK_MODEL.predict(X_scaled)[0]
            autofill["N"] = int(round(float(pred[0])))
            autofill["P"] = int(round(float(pred[1])))
            autofill["K"] = int(round(float(pred[2])))
            autofill["npk_source"] = "ai"
        except Exception as e:
            print(f"⚠️  NPK prediction failed: {e}")
            autofill["npk_source"] = "unavailable"
    else:
        autofill["npk_source"] = "unavailable"

    return jsonify(success=True, autofill=autofill)


# ══════════════════════════════════════════════════════════════════════════════
#  AI KRISHI CHATBOT — Gemini-powered Agriculture Advisor
# ══════════════════════════════════════════════════════════════════════════════

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyCfJBchdnxjDizWgT7Ppg-PAlZiWf3G9gE")
GEMINI_MODEL = None

KRISHI_SYSTEM_PROMPT = """You are "Kisan Salahkar" — the AI assistant built into the Kisan Salahkar Agriculture Advisory System. You speak natural Hinglish (Hindi + English) like a real farmer's friend.

CORE RULES:
- Give ONLY what the farmer asked. No extra topics. No padding.
- Be specific: exact quantities, timing, product names, costs.
- Short answers for simple questions. Detailed only when the topic needs it.
- Max 200 words for simple questions, max 400 for complex ones.
- NEVER repeat information the farmer already knows from context.
- When sensor/profile data is available, USE it — don't ask for it again.
- End with 1 short encouraging line, not a paragraph.

SYSTEM KNOWLEDGE (Kisan Salahkar app features — guide users here):
- 🌾 /crop — Crop Advice: Enter soil NPK, pH, temperature, humidity, rainfall → AI predicts best crops. Has prediction history.
- 🌦️ /weather — Weather: Enter city name → 3-day forecast with farming tips.
- 📊 /mandi — Mandi Bhav: Live market prices from data.gov.in. Search by state/district/commodity. Favorites feature.
- 🐛 /disease — Disease Detection: Upload crop photo → AI identifies disease + treatment. Also text-based detection.
- 🧪 /soil — Soil Analysis: Enter NPK + pH values → detailed soil health report with fertilizer recommendations.
- 🏛️ /schemes — Govt Schemes: PM-KISAN, PMFBY, KCC, Soil Health Card, e-NAM, PM Kusum with eligibility checker.
- 📡 /iot — IoT Dashboard: Live sensor data from ESP32 (temp, humidity, moisture, pH). Auto-fill for crop prediction.
- 💬 /forum — Kisan Forum: Ask questions, share experience with other farmers.
- 🔔 /alerts — Weather & price alerts via subscription.

WHEN USER ASKS ABOUT A FEATURE: Tell them exactly which page to go to and what to do there. Be a guide.
WHEN USER ASKS FARMING QUESTION: Give direct expert answer using any available context (sensors, location, season, their crop history).
WHEN USER'S PREVIOUS CROPS/HISTORY IS IN CONTEXT: Reference it — "Aapne pehle gehun ki prediction li thi, uske hisaab se..."

TONE: Warm but brief. "Bhai", "kisan bhai" naturally. No long intros."""


def _init_gemini():
    """Initialize Gemini model (lazy, on first chat request)."""
    global GEMINI_MODEL, GEMINI_API_KEY
    if GEMINI_MODEL:
        return True
    key = GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
    if not key:
        return False
    try:
        genai.configure(api_key=key)
        GEMINI_MODEL = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=KRISHI_SYSTEM_PROMPT,
        )
        print("✅ Gemini chatbot initialized")
        return True
    except Exception as e:
        print(f"⚠️  Gemini init failed: {e}")
        GEMINI_MODEL = None
        return False


def _build_chat_context(current_page=""):
    """Gather live sensor + weather + user data + prediction history to enrich AI context."""
    ctx_parts = []

    # Current page the user is on
    if current_page:
        ctx_parts.append(f"[CURRENT PAGE] User is on: {current_page}")

    # Sensor data
    try:
        db = get_db()
        row = db.execute(
            "SELECT * FROM sensor_readings ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        if row:
            age = time.time() - row["timestamp"]
            if age < 600:  # within 10 min
                ctx_parts.append(
                    f"[LIVE SENSOR DATA] Temperature: {row['temperature']}°C, "
                    f"Humidity: {row['humidity']}%, Soil Moisture: {row['moisture']}%, "
                    f"pH: {row['ph']}"
                )
    except Exception:
        pass

    # User profile
    user = session.get("user")
    if user:
        loc = user.get("location", "")
        state = user.get("state", "")
        name = user.get("name", "")
        if name:
            ctx_parts.append(f"[USER NAME] {name}")
        if loc or state:
            ctx_parts.append(f"[USER LOCATION] {loc}, {state}")

    # Recent crop predictions (last 5)
    try:
        db = get_db()
        preds = db.execute(
            "SELECT crop, nitrogen, phosphorus, potassium, ph, temperature, humidity, rainfall, created_at "
            "FROM predictions ORDER BY created_at DESC LIMIT 5"
        ).fetchall()
        if preds:
            pred_lines = []
            for p in preds:
                pred_lines.append(
                    f"  • {p['crop']} (N:{p['nitrogen']}, P:{p['phosphorus']}, K:{p['potassium']}, "
                    f"pH:{p['ph']}, Temp:{p['temperature']}°C, Hum:{p['humidity']}%, Rain:{p['rainfall']}mm)"
                )
            ctx_parts.append("[USER'S RECENT CROP PREDICTIONS]\n" + "\n".join(pred_lines))
    except Exception:
        pass

    # Recent soil analysis
    try:
        db = get_db()
        soil = db.execute(
            "SELECT nitrogen, phosphorus, potassium, ph, created_at "
            "FROM soil_reports ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        if soil:
            ctx_parts.append(
                f"[LATEST SOIL REPORT] N:{soil['nitrogen']}, P:{soil['phosphorus']}, "
                f"K:{soil['potassium']}, pH:{soil['ph']}"
            )
    except Exception:
        pass

    # Current date/season
    month = datetime.now().month
    if month in (6, 7, 8, 9):
        season = "Kharif (monsoon)"
    elif month in (10, 11, 12, 1, 2):
        season = "Rabi (winter)"
    else:
        season = "Zaid (summer)"
    ctx_parts.append(f"[SEASON] {season}, Date: {datetime.now().strftime('%d %B %Y')}")
    return "\n".join(ctx_parts)


@app.route("/api/chat", methods=["POST"])
def chat():
    """AI Krishi Advisor chat endpoint."""
    data = request.get_json(force=True)
    user_msg = bleach.clean(data.get("message", "").strip())
    history = data.get("history", [])  # [{role,text}, ...]
    current_page = data.get("page", "")

    if not user_msg:
        return jsonify(success=False, error="Message is required"), 400
    if len(user_msg) > 1000:
        return jsonify(success=False, error="Message too long (max 1000 chars)"), 400

    # Try Gemini
    if _init_gemini() and GEMINI_MODEL:
        try:
            context = _build_chat_context(current_page)
            # Build conversation history for Gemini
            gemini_history = []
            for h in history[-10:]:  # last 10 messages
                role = "user" if h.get("role") == "user" else "model"
                gemini_history.append({"role": role, "parts": [h.get("text", "")]})

            chat_session = GEMINI_MODEL.start_chat(history=gemini_history)

            # Prepend context to user message
            full_msg = user_msg
            if context:
                full_msg = f"[CONTEXT for this farmer]\n{context}\n\n[FARMER'S QUESTION]\n{user_msg}"

            response = chat_session.send_message(full_msg)
            reply = response.text.strip()
            return jsonify(success=True, reply=reply, source="gemini")
        except Exception as e:
            print(f"⚠️  Gemini chat error: {e}")
            # Fall through to fallback
            pass

    # ── Fallback: rule-based responses ──
    reply = _fallback_chat(user_msg)
    return jsonify(success=True, reply=reply, source="fallback")


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    """Streaming chat endpoint — returns SSE events with text chunks."""
    data = request.get_json(force=True)
    user_msg = bleach.clean(data.get("message", "").strip())
    history = data.get("history", [])
    current_page = data.get("page", "")

    if not user_msg:
        return jsonify(success=False, error="Message is required"), 400
    if len(user_msg) > 1000:
        return jsonify(success=False, error="Message too long"), 400

    def generate():
        import json as _json
        # Try Gemini streaming
        if _init_gemini() and GEMINI_MODEL:
            try:
                context = _build_chat_context(current_page)
                gemini_history = []
                for h in history[-10:]:
                    role = "user" if h.get("role") == "user" else "model"
                    gemini_history.append({"role": role, "parts": [h.get("text", "")]})

                chat_session = GEMINI_MODEL.start_chat(history=gemini_history)
                full_msg = user_msg
                if context:
                    full_msg = f"[CONTEXT for this farmer]\n{context}\n\n[FARMER'S QUESTION]\n{user_msg}"

                response = chat_session.send_message(full_msg, stream=True)
                for chunk in response:
                    if chunk.text:
                        yield f"data: {_json.dumps({'chunk': chunk.text})}\n\n"
                yield f"data: {_json.dumps({'done': True, 'source': 'gemini'})}\n\n"
                return
            except Exception as e:
                print(f"⚠️  Gemini stream error: {e}")

        # Fallback — send whole response as single chunk
        reply = _fallback_chat(user_msg)
        yield f"data: {_json.dumps({'chunk': reply})}\n\n"
        yield f"data: {_json.dumps({'done': True, 'source': 'fallback'})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _fallback_chat(msg):
    """Keyword-based fallback when Gemini API is temporarily unavailable."""
    m = msg.lower()

    if any(w in m for w in ["hello", "hi", "namaste", "नमस्ते", "hlo"]):
        return ("🙏 Namaste kisan bhai! Main Kisan Salahkar hoon — aapka apna khet ka expert.\n\n"
                "Mujhse farming ke baare mein kuch bhi poochho — fasal, khad, rog, mausam, "
                "mandi bhav, sarkari yojnayein — sab detail mein bataunga!\n\n"
                "Bas apna sawaal type karein ya mic button dabayein 🎤")

    if any(w in m for w in ["fertilizer", "khad", "urea", "dap", "खाद"]):
        return ("🧪 **Khad / Fertilizer ki Puri Jaankari:**\n\n"
                "**Nitrogen (N) badhane ke liye:**\n"
                "• Urea (46-0-0) — 80-120 kg/ha, 2-3 split doses mein\n"
                "• Neem Coated Urea — slow release, zyada effective\n\n"
                "**Phosphorus (P) badhane ke liye:**\n"
                "• DAP (18-46-0) — 50-100 kg/ha, buwai ke samay\n"
                "• SSP (0-16-0) — sasta alternative, 150-250 kg/ha\n\n"
                "**Potassium (K) badhane ke liye:**\n"
                "• MOP (0-0-60) — 40-60 kg/ha\n\n"
                "**pH Correction:**\n"
                "• pH < 6 → Chuna (lime) 2-4 quintal/ha, buwai se 15-20 din pehle\n"
                "• pH > 8 → Gypsum 2-3 quintal/ha\n\n"
                "**Organic Options:** Vermicompost 2-3 ton/ha, Jeevamrit, Panchagavya\n\n"
                "💡 Soil test karwayein — Soil Testing page pe exact NPK values dalein!")

    if any(w in m for w in ["weather", "mausam", "barish", "rain", "मौसम", "बारिश"]):
        return ("🌦️ **Mausam aur Fasal ka Connection:**\n\n"
                "Weather page pe jaayein — city dalke live forecast milega.\n\n"
                "**Mausam ke hisaab se kya karein:**\n"
                "• ☀️ **Garmi (>40°C)** → Mulching karein, subah 6 baje ya shaam 5 ke baad paani dein\n"
                "• 🌧️ **Barish** → Spray na karein, drainage channels khulein rakhein, waterlogging check\n"
                "• ❄️ **Thand (<5°C)** → Frost-sensitive crops ko plastic/puwaaal se dhakein\n"
                "• 💨 **Tez hawa** → Nayi transplanting na karein, support stakes lagayein\n"
                "• 💧 **Humidity >80%** → Fungal disease ka risk! Mancozeb 0.25% spray ready rakhein")

    if any(w in m for w in ["mandi", "bhav", "price", "rate", "बाज़ार", "भाव", "मंडी"]):
        return ("📊 **Mandi Bhav aur Selling Tips:**\n\n"
                "Mandi page pe jaayein — data.gov.in se live prices milte hain.\n\n"
                "**Fasal bechne ke tips:**\n"
                "• MSP se neeche bik raha hai → Govt procurement center pe bechein\n"
                "• Multiple mandis ke bhav compare karein — 500-1000 Rs/quintal ka farak hota hai\n"
                "• **e-NAM portal** pe register karein — online mandi access\n"
                "• **Warehousing Receipt** lo → baad mein achha bhav milne pe becho\n"
                "• Bechne se pehle grading aur sorting karein — achha grade = achha bhav\n\n"
                "💡 FPO (Farmer Producer Organization) se judein — group mein bechne se achha rate milta hai!")

    if any(w in m for w in ["disease", "rog", "bimari", "pest", "keet", "रोग", "कीट"]):
        return ("🐛 **Rog aur Keet ka Ilaaj:**\n\n"
                "Disease Detection page pe photo upload karein — AI identify karega.\n\n"
                "**Common problems aur solution:**\n"
                "• 🟡 **Patti pe peele/brown spots** → Fungal infection\n"
                "  → Mancozeb 0.25% ya Carbendazim 0.1% spray karein\n"
                "• 🔄 **Patti curling/murjhaana** → Virus/whitefly attack\n"
                "  → Imidacloprid 17.8% SL — 0.5ml/litre paani mein spray\n"
                "• 🪱 **Tana chhedak (stem borer)** → Carbofuran 3G granules daalein\n"
                "• 🟫 **Jad sadna (root rot)** → Paani kam karein, Trichoderma 5g/litre drench\n\n"
                "**Organic options:** Neem tel 5ml/litre, Beauveria bassiana, Yellow sticky traps\n\n"
                "💡 IPM (Integrated Pest Management) approach sabse achha hai!")

    if any(w in m for w in ["scheme", "yojana", "pm kisan", "pmkisan", "योजना", "सरकारी"]):
        return ("🏛️ **Sarkari Yojnayein — Full Detail:**\n\n"
                "• **PM-KISAN:** ₹6,000/saal (₹2,000 har 4 mahine)\n"
                "  → pmkisan.gov.in pe register karein\n\n"
                "• **PM Fasal Bima (PMFBY):** Crop insurance\n"
                "  → Kharif 2%, Rabi 1.5% premium\n"
                "  → pmfby.gov.in pe apply karein\n\n"
                "• **Kisan Credit Card (KCC):** Low-interest loan (4% tak)\n"
                "  → Apne bank mein jaayein with land papers\n\n"
                "• **Soil Health Card:** Free soil testing\n"
                "  → soilhealth.dac.gov.in\n\n"
                "• **PM Kusum:** Solar pump subsidy (90% tak)\n"
                "  → mnre.gov.in\n\n"
                "• **e-NAM:** Online mandi — better prices milte hain\n\n"
                "Schemes page pe eligibility aur apply process check karein!")

    if any(w in m for w in ["crop", "fasal", "kya ugau", "ugana", "recommend", "फसल"]):
        return ("🌾 **Fasal Chunne ka Guide:**\n\n"
                "Crop Advice page pe apni soil ki values dalein — AI best fasal batayega.\n\n"
                "**Season ke hisaab se top fasalein:**\n"
                "• **Kharif (Jun-Oct):** Dhaan, Makka, Kapas, Soybean, Bajra, Tur\n"
                "• **Rabi (Nov-Mar):** Gehun, Chana, Sarson, Aloo, Masoor\n"
                "• **Zaid (Mar-Jun):** Tarbooz, Kheera, Moong, Bhindi, Kaddu\n\n"
                "**Smart tips:**\n"
                "• Faslon ka rotation karein — mitti ki sehat bani rahegi\n"
                "• Intercropping try karein — ek saath do fasal ka fayda\n"
                "• Apne area ki popular varieties chunein — KVK se seedlist lein\n\n"
                "💡 Mujhe apni location aur mitti ki jaankari dein toh specific advice de sakta hoon!")

    # Default
    return ("🌾 Namaste kisan bhai! Main Kisan Salahkar hoon.\n\n"
            "Mujhse yeh sab poochh sakte hain:\n\n"
            "• 🌱 Kaunsi fasal ugaayein?\n"
            "• 🧪 Kaun si khad daalein? Kitni daalein?\n"
            "• 🌦️ Mausam ka fasal pe asar\n"
            "• 📊 Mandi bhav aur selling tips\n"
            "• 🐛 Rog aur keeton ka ilaaj\n"
            "• 🏛️ Sarkari yojnayein — paisa kaise milega\n"
            "• 💧 Sinchai (irrigation) advice\n"
            "• 🌍 Mitti ki jaanch aur sudhar\n\n"
            "Bas apna sawaal type karein ya mic 🎤 dabayein — main detail mein bataunga!")


# ══════════════════════════════════════════════════════════════════════════════
#  MARKETPLACE  — Autonomous Agri Marketplace Agent
# ══════════════════════════════════════════════════════════════════════════════

def _market_auto_price(crop, state, quality="standard"):
    """Calculate AI auto-price based on MSP + mandi data + quality adjustment."""
    base = MSP_DATA.get(crop, 0)
    if not base:
        fb = MANDI_FALLBACK.get(crop, [])
        if fb and isinstance(fb, list):
            base = fb[0].get("price", 2000)
        elif fb and isinstance(fb, dict):
            base = fb.get("avg", 2000)
        else:
            base = 2000
    q_mult = {"premium": 1.15, "standard": 1.0, "fair": 0.85}.get(quality, 1.0)
    return round(base * q_mult)

def _match_buyers_for_listing(listing):
    """Find matching buyer demands for a listing."""
    db = get_db()
    demands = db.execute(
        "SELECT d.*, u.name as buyer_name, u.phone as buyer_phone, u.username as buyer_username "
        "FROM market_demands d JOIN users u ON d.user_id = u.id "
        "WHERE d.crop = ? AND d.status = 'active' AND d.qty_kg <= ? "
        "ORDER BY d.max_price DESC",
        (listing["crop"], listing["qty_kg"])
    ).fetchall()
    db.close()
    matches = []
    for d in demands:
        d = dict(d)
        score = 0
        if d["max_price"] >= listing["ask_price"]:
            score += 40
        if d.get("state") == listing.get("state"):
            score += 30
        if d.get("district") == listing.get("district"):
            score += 20
        score += min(10, int(d["qty_kg"] / max(listing["qty_kg"], 1) * 10))
        d["match_score"] = score
        matches.append(d)
    matches.sort(key=lambda x: x["match_score"], reverse=True)
    return matches[:10]

def _match_listings_for_demand(demand):
    """Find matching listings for a buyer demand."""
    db = get_db()
    listings = db.execute(
        "SELECT l.*, u.name as seller_name, u.phone as seller_phone, u.username as seller_username "
        "FROM market_listings l JOIN users u ON l.user_id = u.id "
        "WHERE l.crop = ? AND l.status = 'active' AND l.qty_kg >= ? "
        "ORDER BY l.ask_price ASC",
        (demand["crop"], demand["qty_kg"])
    ).fetchall()
    db.close()
    matches = []
    for l in listings:
        l = dict(l)
        score = 0
        if l["ask_price"] <= demand["max_price"]:
            score += 40
        if l.get("state") == demand.get("state"):
            score += 30
        if l.get("district") == demand.get("district"):
            score += 20
        score += min(10, int(demand["qty_kg"] / max(l["qty_kg"], 1) * 10))
        l["match_score"] = score
        matches.append(l)
    matches.sort(key=lambda x: x["match_score"], reverse=True)
    return matches[:10]


# ── Seller: Create listing ──
@app.route("/api/market/listing", methods=["POST"])
def api_market_create_listing():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    crop = sanitize(data.get("crop", "")).strip()
    qty = float(data.get("qty_kg", 0))
    quality = sanitize(data.get("quality", "standard"))
    ask_price = float(data.get("ask_price", 0))
    location = sanitize(data.get("location", ""))
    state = sanitize(data.get("state", ""))
    district = sanitize(data.get("district", ""))
    desc = sanitize(data.get("description", ""))
    delivery_options = sanitize(data.get("delivery_options", "pickup"))
    seller_address = sanitize(data.get("seller_address", ""))
    if not crop or qty <= 0:
        return jsonify(success=False, error="Crop and quantity required"), 400
    auto_price = _market_auto_price(crop, state, quality)
    if ask_price <= 0:
        ask_price = auto_price
    db = get_db()
    user = db.execute("SELECT id, name FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not user:
        db.close()
        return jsonify(success=False, error="User not found"), 404
    cur = db.execute(
        "INSERT INTO market_listings (user_id, crop, qty_kg, quality, ask_price, location, state, district, description, auto_price, delivery_options, seller_address) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user["id"], crop, qty, quality, ask_price, location, state, district, desc, auto_price, delivery_options, seller_address)
    )
    listing_id = cur.lastrowid
    db.commit()
    listing = dict(db.execute("SELECT * FROM market_listings WHERE id=?", (listing_id,)).fetchone())
    # Auto-match buyers
    matches = _match_buyers_for_listing(listing)
    # Notify matching buyers
    from urllib.parse import quote
    seller_name = user["name"] or session["user"]["username"]
    for m in matches[:5]:
        _notify(m["user_id"], "match",
                f"\U0001f33e New listing matches your demand \u2014 {crop}",
                f"{qty}kg of {crop} at \u20b9{ask_price}/q available near {location or state}",
                f"/marketplace?chat=1&listing_id={listing_id}&peer_id={user['id']}&peer_name={quote(seller_name)}")
    db.close()
    return jsonify(success=True, listing=listing, auto_price=auto_price, matches=[
        {"buyer_name": m["buyer_name"], "buyer_phone": m.get("buyer_phone", ""),
         "user_id": m["user_id"], "qty_kg": m["qty_kg"], "max_price": m["max_price"],
         "crop": m["crop"], "state": m.get("state", ""), "district": m.get("district", ""),
         "score": m["match_score"], "id": m["id"], "created_at": m.get("created_at", "")}
        for m in matches
    ])


# ── Buyer: Create demand ──
@app.route("/api/market/demand", methods=["POST"])
def api_market_create_demand():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    crop = sanitize(data.get("crop", "")).strip()
    qty = float(data.get("qty_kg", 0))
    max_price = float(data.get("max_price", 0))
    location = sanitize(data.get("location", ""))
    state = sanitize(data.get("state", ""))
    district = sanitize(data.get("district", ""))
    if not crop or qty <= 0:
        return jsonify(success=False, error="Crop and quantity required"), 400
    db = get_db()
    user = db.execute("SELECT id, name FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not user:
        db.close()
        return jsonify(success=False, error="User not found"), 404
    cur = db.execute(
        "INSERT INTO market_demands (user_id, crop, qty_kg, max_price, location, state, district) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user["id"], crop, qty, max_price, location, state, district)
    )
    demand_id = cur.lastrowid
    db.commit()
    demand = dict(db.execute("SELECT * FROM market_demands WHERE id=?", (demand_id,)).fetchone())
    matches = _match_listings_for_demand(demand)
    # Notify matching sellers
    from urllib.parse import quote
    buyer_name = user["name"] or session["user"]["username"]
    for m in matches[:5]:
        _notify(m["user_id"], "match",
                f"\U0001f4e6 New buyer looking for {crop}",
                f"Buyer wants {qty}kg of {crop}, max \u20b9{max_price}/q in {location or state}",
                f"/marketplace?chat=1&listing_id=0&peer_id={user['id']}&peer_name={quote(buyer_name)}")
    db.close()
    return jsonify(success=True, demand=demand, matches=[
        {"seller_name": m["seller_name"], "seller_phone": m.get("seller_phone", ""),
         "user_id": m["user_id"], "qty_kg": m["qty_kg"], "ask_price": m["ask_price"],
         "auto_price": m.get("auto_price", 0), "quality": m.get("quality", ""),
         "crop": m["crop"], "state": m.get("state", ""), "district": m.get("district", ""),
         "score": m["match_score"], "id": m["id"], "created_at": m.get("created_at", ""),
         "description": m.get("description", "")}
        for m in matches
    ])


# ── Browse listings ──
@app.route("/api/market/listings")
def api_market_listings():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    crop = request.args.get("crop", "")
    state = request.args.get("state", "")
    db = get_db()
    q = "SELECT l.*, u.name as seller_name, u.phone as seller_phone, u.district as seller_district FROM market_listings l JOIN users u ON l.user_id = u.id WHERE l.status = 'active'"
    params = []
    if crop:
        q += " AND l.crop = ?"
        params.append(crop)
    if state:
        q += " AND l.state = ?"
        params.append(state)
    q += " ORDER BY l.created_at DESC LIMIT 50"
    rows = db.execute(q, params).fetchall()
    db.close()
    return jsonify(success=True, listings=[dict(r) for r in rows])


# ── Browse demands ──
@app.route("/api/market/demands")
def api_market_demands():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    crop = request.args.get("crop", "")
    state = request.args.get("state", "")
    db = get_db()
    q = "SELECT d.*, u.name as buyer_name, u.phone as buyer_phone FROM market_demands d JOIN users u ON d.user_id = u.id WHERE d.status = 'active'"
    params = []
    if crop:
        q += " AND d.crop = ?"
        params.append(crop)
    if state:
        q += " AND d.state = ?"
        params.append(state)
    q += " ORDER BY d.created_at DESC LIMIT 50"
    rows = db.execute(q, params).fetchall()
    db.close()
    return jsonify(success=True, demands=[dict(r) for r in rows])


# ── My listings & demands ──
@app.route("/api/market/my")
def api_market_my():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not user:
        db.close()
        return jsonify(success=False, error="User not found"), 404
    uid = user["id"]
    listings = [dict(r) for r in db.execute(
        "SELECT * FROM market_listings WHERE user_id=? ORDER BY created_at DESC", (uid,)
    ).fetchall()]
    demands = [dict(r) for r in db.execute(
        "SELECT * FROM market_demands WHERE user_id=? ORDER BY created_at DESC", (uid,)
    ).fetchall()]
    deals = [dict(r) for r in db.execute(
        "SELECT d.*, u1.name as seller_name, u1.phone as seller_phone, "
        "u2.name as buyer_name, u2.phone as buyer_phone "
        "FROM market_deals d "
        "JOIN users u1 ON d.seller_id = u1.id "
        "JOIN users u2 ON d.buyer_id = u2.id "
        "WHERE d.seller_id=? OR d.buyer_id=? ORDER BY d.created_at DESC",
        (uid, uid)
    ).fetchall()]
    db.close()
    return jsonify(success=True, listings=listings, demands=demands, deals=deals)


# ── Make offer / initiate deal ──
@app.route("/api/market/offer", methods=["POST"])
def api_market_offer():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    listing_id = int(data.get("listing_id", 0))
    offer_price = float(data.get("offer_price", 0))
    qty = float(data.get("qty_kg", 0))
    if not listing_id or offer_price <= 0:
        return jsonify(success=False, error="Listing ID and offer price required"), 400
    db = get_db()
    buyer = db.execute("SELECT id, name, phone FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    listing = db.execute(
        "SELECT l.*, u.name as seller_name, u.phone as seller_phone, u.id as seller_uid "
        "FROM market_listings l JOIN users u ON l.user_id = u.id WHERE l.id=? AND l.status='active'",
        (listing_id,)
    ).fetchone()
    if not listing:
        db.close()
        return jsonify(success=False, error="Listing not found or inactive"), 404
    if buyer["id"] == listing["user_id"]:
        db.close()
        return jsonify(success=False, error="Cannot buy your own listing"), 400
    actual_qty = qty if qty > 0 else listing["qty_kg"]
    # Auto-negotiate: if offer >= ask_price, deal is auto-accepted
    ask = listing["ask_price"]
    status = "accepted" if offer_price >= ask else "pending"
    deal_price = ask if offer_price >= ask else offer_price
    total = round(deal_price * actual_qty / 100, 2)  # price per quintal, qty in kg
    cur = db.execute(
        "INSERT INTO market_deals (listing_id, seller_id, buyer_id, crop, qty_kg, deal_price, total_amount, status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (listing_id, listing["user_id"], buyer["id"], listing["crop"], actual_qty, deal_price, total, status)
    )
    deal_id = cur.lastrowid
    if status == "accepted":
        db.execute("UPDATE market_listings SET status='sold' WHERE id=?", (listing_id,))
    db.commit()
    deal = dict(db.execute("SELECT * FROM market_deals WHERE id=?", (deal_id,)).fetchone())
    db.close()
    # ── In-app notification to seller ──
    from urllib.parse import quote
    if status == "accepted":
        _notify(listing["user_id"], "deal",
                f"✅ Deal Confirmed — {listing['crop']}",
                f"{buyer['name']} bought {actual_qty}kg at ₹{deal_price}/q. Total: ₹{total}",
                f"/marketplace?chat=1&listing_id={listing_id}&peer_id={buyer['id']}&peer_name={quote(buyer['name'])}")
    else:
        _notify(listing["user_id"], "offer",
                f"📋 New Offer — {listing['crop']}",
                f"{buyer['name']} offered ₹{offer_price}/q for {actual_qty}kg of {listing['crop']}",
                f"/marketplace?chat=1&listing_id={listing_id}&peer_id={buyer['id']}&peer_name={quote(buyer['name'])}")
    wa_msg = (f"🤝 Kisan Salahkar Marketplace\n\n"
              f"{'✅ Deal Confirmed!' if status == 'accepted' else '📋 New Offer Received'}\n"
              f"Crop: {listing['crop']}\n"
              f"Qty: {actual_qty} kg\n"
              f"Price: ₹{deal_price}/quintal\n"
              f"Total: ₹{total}\n"
              f"Buyer: {buyer['name']}\n"
              f"Status: {status.upper()}")
    return jsonify(success=True, deal=deal, status=status, wa_message=wa_msg,
                   seller_phone=listing.get("seller_phone", ""),
                   buyer_phone=buyer.get("phone", ""))


# ── Accept / Reject deal ──
@app.route("/api/market/deal/<int:deal_id>", methods=["PUT"])
def api_market_deal_action(deal_id):
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    action = data.get("action", "")  # accept, reject, counter
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    deal = db.execute("SELECT * FROM market_deals WHERE id=?", (deal_id,)).fetchone()
    if not deal:
        db.close()
        return jsonify(success=False, error="Deal not found"), 404
    if user["id"] not in (deal["seller_id"], deal["buyer_id"]):
        db.close()
        return jsonify(success=False, error="Not authorized"), 403
    # Determine who the "other party" is for notification
    other_id = deal["buyer_id"] if user["id"] == deal["seller_id"] else deal["seller_id"]
    actor_name_row = db.execute("SELECT name FROM users WHERE id=?", (user["id"],)).fetchone()
    actor_name = actor_name_row["name"] if actor_name_row else "Someone"
    from urllib.parse import quote
    if action == "accept":
        db.execute("UPDATE market_deals SET status='accepted' WHERE id=?", (deal_id,))
        db.execute("UPDATE market_listings SET status='sold' WHERE id=?", (deal["listing_id"],))
        db.commit()
        db.close()
        _notify(other_id, "deal", f"✅ Deal Accepted — {deal['crop']}",
                f"{actor_name} accepted the deal for {deal['qty_kg']}kg at ₹{deal['deal_price']}/q",
                f"/marketplace?chat=1&listing_id={deal['listing_id']}&peer_id={user['id']}&peer_name={quote(actor_name)}")
        return jsonify(success=True, status="accepted")
    elif action == "reject":
        db.execute("UPDATE market_deals SET status='rejected' WHERE id=?", (deal_id,))
        db.commit()
        db.close()
        _notify(other_id, "deal", f"❌ Deal Rejected — {deal['crop']}",
                f"{actor_name} rejected the deal for {deal['qty_kg']}kg",
                f"/marketplace?chat=1&listing_id={deal['listing_id']}&peer_id={user['id']}&peer_name={quote(actor_name)}")
        return jsonify(success=True, status="rejected")
    elif action == "counter":
        new_price = float(data.get("counter_price", 0))
        if new_price <= 0:
            db.close()
            return jsonify(success=False, error="Counter price required"), 400
        total = round(new_price * deal["qty_kg"] / 100, 2)
        db.execute("UPDATE market_deals SET deal_price=?, total_amount=?, status='countered' WHERE id=?",
                   (new_price, total, deal_id))
        db.commit()
        db.close()
        _notify(other_id, "deal", f"💰 Counter Offer — {deal['crop']}",
                f"{actor_name} countered with ₹{new_price}/q for {deal['qty_kg']}kg",
                f"/marketplace?chat=1&listing_id={deal['listing_id']}&peer_id={user['id']}&peer_name={quote(actor_name)}")
        return jsonify(success=True, status="countered", new_price=new_price, total=total)
    db.close()
    return jsonify(success=False, error="Invalid action"), 400


# ── Chat messages for a deal ──
@app.route("/api/market/chat/<int:listing_id>", methods=["GET", "POST"])
def api_market_chat(listing_id):
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not user:
        db.close()
        return jsonify(success=False, error="User not found"), 404
    uid = user["id"]
    if request.method == "GET":
        if listing_id > 0:
            msgs = db.execute(
                "SELECT m.*, u.name as sender_name FROM market_messages m "
                "JOIN users u ON m.sender_id = u.id "
                "WHERE m.listing_id=? ORDER BY m.created_at ASC LIMIT 100",
                (listing_id,)
            ).fetchall()
        else:
            # Direct user-to-user: fetch by participant pair
            peer_id = int(request.args.get("peer", 0))
            if not peer_id:
                db.close()
                return jsonify(success=True, messages=[])
            msgs = db.execute(
                "SELECT m.*, u.name as sender_name FROM market_messages m "
                "JOIN users u ON m.sender_id = u.id "
                "WHERE m.listing_id=0 AND "
                "((m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)) "
                "ORDER BY m.created_at ASC LIMIT 100",
                (uid, peer_id, peer_id, uid)
            ).fetchall()
        out = []
        for r in msgs:
            d = dict(r)
            d["is_mine"] = d["sender_id"] == uid
            out.append(d)
        db.close()
        return jsonify(success=True, messages=out)
    # POST — send message
    data = request.get_json(force=True)
    msg = sanitize(data.get("message", "")).strip()
    receiver_id = int(data.get("receiver_id", 0))
    if not msg or not receiver_id:
        db.close()
        return jsonify(success=False, error="Message and receiver required"), 400
    msg_type = sanitize(data.get("msg_type", "text"))
    db.execute(
        "INSERT INTO market_messages (listing_id, sender_id, receiver_id, message, msg_type) VALUES (?, ?, ?, ?, ?)",
        (listing_id, uid, receiver_id, msg, msg_type)
    )
    db.commit()
    # Fetch receiver phone + sender name for WhatsApp alert
    receiver = db.execute("SELECT phone FROM users WHERE id=?", (receiver_id,)).fetchone()
    sender = db.execute("SELECT name FROM users WHERE id=?", (uid,)).fetchone()
    receiver_phone = receiver["phone"] if receiver and receiver["phone"] else ""
    sender_name = sender["name"] if sender else ""
    db.close()
    # ── In-app notification to receiver ──
    from urllib.parse import quote
    preview = msg[:80] + ("..." if len(msg) > 80 else "")
    _notify(receiver_id, "message",
            f"💬 New message from {sender_name}",
            preview, f"/marketplace?chat=1&listing_id={listing_id}&peer_id={uid}&peer_name={quote(sender_name)}")
    return jsonify(success=True, receiver_phone=receiver_phone, sender_name=sender_name)


# ── Auto-price lookup ──
@app.route("/api/market/autoprice")
def api_market_autoprice():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    crop = request.args.get("crop", "")
    state = request.args.get("state", "")
    quality = request.args.get("quality", "standard")
    if not crop:
        return jsonify(success=False, error="Crop required"), 400
    price = _market_auto_price(crop, state, quality)
    msp = MSP_DATA.get(crop, 0)
    return jsonify(success=True, auto_price=price, msp=msp, crop=crop, quality=quality)


# ── Market stats ──
@app.route("/api/market/stats")
def api_market_stats():
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    db = get_db()
    active_listings = db.execute("SELECT COUNT(*) as c FROM market_listings WHERE status='active'").fetchone()["c"]
    active_demands = db.execute("SELECT COUNT(*) as c FROM market_demands WHERE status='active'").fetchone()["c"]
    total_deals = db.execute("SELECT COUNT(*) as c FROM market_deals").fetchone()["c"]
    completed = db.execute("SELECT COUNT(*) as c FROM market_deals WHERE status='accepted'").fetchone()["c"]
    top_crops = [dict(r) for r in db.execute(
        "SELECT crop, COUNT(*) as count, AVG(ask_price) as avg_price FROM market_listings "
        "WHERE status='active' GROUP BY crop ORDER BY count DESC LIMIT 5"
    ).fetchall()]
    db.close()
    return jsonify(success=True, stats={
        "active_listings": active_listings,
        "active_demands": active_demands,
        "total_deals": total_deals, "completed_deals": completed,
        "top_crops": top_crops
    })


# ══════════════════════════════════════════════════════════════════════════════
#  MARKETPLACE: Photo Upload
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/market/photo/<int:listing_id>", methods=["POST"])
def api_market_upload_photo(listing_id):
    """Upload up to 3 photos per listing."""
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    listing = db.execute("SELECT * FROM market_listings WHERE id=?", (listing_id,)).fetchone()
    if not listing:
        db.close()
        return jsonify(success=False, error="Listing not found"), 404
    if listing["user_id"] != user["id"]:
        db.close()
        return jsonify(success=False, error="Not your listing"), 403
    # Check existing photo count
    existing = db.execute("SELECT COUNT(*) as c FROM market_photos WHERE listing_id=?", (listing_id,)).fetchone()["c"]
    if existing >= 3:
        db.close()
        return jsonify(success=False, error="Max 3 photos per listing"), 400
    if "photo" not in request.files:
        db.close()
        return jsonify(success=False, error="No photo uploaded"), 400
    file = request.files["photo"]
    if not file or not file.filename:
        db.close()
        return jsonify(success=False, error="Empty file"), 400
    if not _allowed_file(file.filename):
        db.close()
        return jsonify(success=False, error="Only JPG, PNG, WEBP allowed"), 400
    # Read and validate size
    data = file.read()
    if len(data) > MAX_PHOTO_SIZE:
        db.close()
        return jsonify(success=False, error="Photo must be under 5 MB"), 400
    # Resize to reasonable dimensions
    try:
        img = Image.open(io.BytesIO(data))
        img.thumbnail((800, 800))
        ext = file.filename.rsplit(".", 1)[1].lower()
        if ext == "webp":
            fmt = "WEBP"
        else:
            fmt = "JPEG"
            ext = "jpg"
        fname = f"{listing_id}_{uuid.uuid4().hex[:8]}.{ext}"
        fpath = os.path.join(UPLOAD_FOLDER, fname)
        img.save(fpath, fmt, quality=85)
    except Exception as e:
        db.close()
        return jsonify(success=False, error=f"Invalid image: {e}"), 400
    db.execute("INSERT INTO market_photos (listing_id, filename) VALUES (?, ?)", (listing_id, fname))
    # Update listing's photos JSON array
    photos = json.loads(listing["photos"] or "[]")
    photos.append(fname)
    db.execute("UPDATE market_listings SET photos=? WHERE id=?", (json.dumps(photos), listing_id))
    db.commit()
    db.close()
    return jsonify(success=True, filename=fname, url=f"/static/uploads/market/{fname}", count=len(photos))


@app.route("/api/market/photo/<int:listing_id>/<filename>", methods=["DELETE"])
def api_market_delete_photo(listing_id, filename):
    """Delete a photo from a listing."""
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    listing = db.execute("SELECT * FROM market_listings WHERE id=?", (listing_id,)).fetchone()
    if not listing or listing["user_id"] != user["id"]:
        db.close()
        return jsonify(success=False, error="Not authorized"), 403
    # Remove from DB
    db.execute("DELETE FROM market_photos WHERE listing_id=? AND filename=?", (listing_id, filename))
    photos = json.loads(listing["photos"] or "[]")
    photos = [p for p in photos if p != filename]
    db.execute("UPDATE market_listings SET photos=? WHERE id=?", (json.dumps(photos), listing_id))
    db.commit()
    db.close()
    # Remove file
    fpath = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.exists(fpath):
        os.remove(fpath)
    return jsonify(success=True)


# ══════════════════════════════════════════════════════════════════════════════
#  MARKETPLACE: Logistics / Delivery Arrangement
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/market/deal/<int:deal_id>/logistics", methods=["PUT"])
def api_market_deal_logistics(deal_id):
    """Update delivery/logistics details for a deal."""
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    deal = db.execute("SELECT * FROM market_deals WHERE id=?", (deal_id,)).fetchone()
    if not deal:
        db.close()
        return jsonify(success=False, error="Deal not found"), 404
    if user["id"] not in (deal["seller_id"], deal["buyer_id"]):
        db.close()
        return jsonify(success=False, error="Not authorized"), 403
    delivery_type = sanitize(data.get("delivery_type", "pickup"))  # pickup | delivery | mandi
    pickup_address = sanitize(data.get("pickup_address", ""))
    delivery_address = sanitize(data.get("delivery_address", ""))
    transport_cost = float(data.get("transport_cost", 0))
    logistics = json.dumps({
        "delivery_type": delivery_type,
        "pickup_address": pickup_address,
        "delivery_address": delivery_address,
        "transport_cost": transport_cost,
        "updated_by": user["id"],
        "updated_at": datetime.now().isoformat(),
    })
    db.execute(
        "UPDATE market_deals SET delivery_type=?, pickup_address=?, delivery_address=?, transport_cost=?, logistics=? WHERE id=?",
        (delivery_type, pickup_address, delivery_address, transport_cost, logistics, deal_id)
    )
    db.commit()
    # Notify other party
    other_id = deal["buyer_id"] if user["id"] == deal["seller_id"] else deal["seller_id"]
    actor_name = db.execute("SELECT name FROM users WHERE id=?", (user["id"],)).fetchone()
    actor_name = actor_name["name"] if actor_name else "Someone"
    db.close()
    dtype_label = {"pickup": "Self Pickup", "delivery": "Home Delivery", "mandi": "Mandi Pickup"}.get(delivery_type, delivery_type)
    _notify(other_id, "logistics",
            f"🚚 Logistics Updated — {deal['crop']}",
            f"{actor_name} set delivery to: {dtype_label}" + (f" (Transport: ₹{transport_cost})" if transport_cost > 0 else ""),
            f"/marketplace")
    return jsonify(success=True, delivery_type=delivery_type, transport_cost=transport_cost)


# ══════════════════════════════════════════════════════════════════════════════
#  MARKETPLACE: Razorpay Payment
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/market/payment/create", methods=["POST"])
def api_market_payment_create():
    """Create a Razorpay order for an accepted deal."""
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    deal_id = int(data.get("deal_id", 0))
    if not deal_id:
        return jsonify(success=False, error="Deal ID required"), 400
    db = get_db()
    user = db.execute("SELECT id, name, phone FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    deal = db.execute("SELECT * FROM market_deals WHERE id=?", (deal_id,)).fetchone()
    if not deal:
        db.close()
        return jsonify(success=False, error="Deal not found"), 404
    if deal["status"] != "accepted":
        db.close()
        return jsonify(success=False, error="Deal must be accepted first"), 400
    if user["id"] != deal["buyer_id"]:
        db.close()
        return jsonify(success=False, error="Only the buyer can pay"), 403
    # Calculate amount (deal total + transport cost)
    transport = float(deal.get("transport_cost", 0) or 0)
    total_amount = deal["total_amount"] + transport
    amount_paise = int(round(total_amount * 100))
    # Create Razorpay order via their API
    import hmac as _hmac
    razorpay_order = None
    try:
        resp = http_requests.post(
            "https://api.razorpay.com/v1/orders",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json={
                "amount": amount_paise,
                "currency": "INR",
                "receipt": f"deal_{deal_id}",
                "notes": {
                    "deal_id": str(deal_id),
                    "crop": deal["crop"],
                    "buyer_id": str(deal["buyer_id"]),
                    "seller_id": str(deal["seller_id"]),
                }
            },
            timeout=15
        )
        if resp.status_code == 200:
            razorpay_order = resp.json()
        else:
            db.close()
            return jsonify(success=False, error=f"Razorpay error: {resp.text}"), 502
    except Exception as e:
        db.close()
        return jsonify(success=False, error=f"Payment gateway error: {e}"), 502
    # Save payment record
    db.execute(
        "INSERT INTO market_payments (deal_id, razorpay_order_id, amount_paise, status) VALUES (?, ?, ?, 'created')",
        (deal_id, razorpay_order["id"], amount_paise)
    )
    db.execute("UPDATE market_deals SET payment_status='initiated' WHERE id=?", (deal_id,))
    db.commit()
    seller = db.execute("SELECT name FROM users WHERE id=?", (deal["seller_id"],)).fetchone()
    db.close()
    return jsonify(
        success=True,
        order_id=razorpay_order["id"],
        amount=amount_paise,
        currency="INR",
        key_id=RAZORPAY_KEY_ID,
        deal=dict(deal),
        seller_name=seller["name"] if seller else "",
        buyer_name=user["name"],
        buyer_phone=user["phone"] or "",
    )


@app.route("/api/market/payment/verify", methods=["POST"])
def api_market_payment_verify():
    """Verify Razorpay payment signature and mark deal as paid."""
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    order_id = data.get("razorpay_order_id", "")
    payment_id = data.get("razorpay_payment_id", "")
    signature = data.get("razorpay_signature", "")
    deal_id = int(data.get("deal_id", 0))
    if not all([order_id, payment_id, signature, deal_id]):
        return jsonify(success=False, error="Missing payment details"), 400
    # Verify signature
    import hmac as _hmac, hashlib as _hashlib
    msg = f"{order_id}|{payment_id}".encode("utf-8")
    expected = _hmac.new(RAZORPAY_KEY_SECRET.encode("utf-8"), msg, _hashlib.sha256).hexdigest()
    if expected != signature:
        return jsonify(success=False, error="Payment verification failed"), 400
    db = get_db()
    # Update payment record
    db.execute(
        "UPDATE market_payments SET razorpay_payment_id=?, razorpay_signature=?, status='paid' "
        "WHERE razorpay_order_id=? AND deal_id=?",
        (payment_id, signature, order_id, deal_id)
    )
    pmt = db.execute("SELECT id FROM market_payments WHERE razorpay_order_id=?", (order_id,)).fetchone()
    pmt_id = pmt["id"] if pmt else 0
    db.execute("UPDATE market_deals SET payment_status='paid', payment_id=? WHERE id=?", (pmt_id, deal_id))
    db.commit()
    # Notify seller that payment is received
    deal = db.execute("SELECT * FROM market_deals WHERE id=?", (deal_id,)).fetchone()
    buyer = db.execute("SELECT name FROM users WHERE id=?", (deal["buyer_id"],)).fetchone()
    buyer_name = buyer["name"] if buyer else "Buyer"
    db.close()
    _notify(deal["seller_id"], "payment",
            f"💰 Payment Received — {deal['crop']}",
            f"{buyer_name} paid ₹{deal['total_amount']} for {deal['qty_kg']}kg of {deal['crop']}. Deal #{deal_id}",
            "/marketplace")
    return jsonify(success=True, status="paid", deal_id=deal_id)


# ── Boot ──────────────────────────────────────────────────────────────────────

# ── Helper: create an in-app notification ──
def _notify(user_id, ntype, title, body="", link=""):
    """Insert a notification row for the given user."""
    db = get_db()
    db.execute(
        "INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)",
        (user_id, ntype, title, body, link)
    )
    db.commit()
    db.close()


# ── Notification API routes ──
@app.route("/api/notifications")
def api_notifications():
    """Get all notifications for logged-in user (latest 50)."""
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not user:
        db.close()
        return jsonify(success=False), 404
    rows = db.execute(
        "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
        (user["id"],)
    ).fetchall()
    unread = db.execute(
        "SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND is_read=0",
        (user["id"],)
    ).fetchone()["c"]
    db.close()
    return jsonify(success=True, notifications=[dict(r) for r in rows], unread=unread)


@app.route("/api/notifications/read", methods=["POST"])
def api_notifications_read():
    """Mark notifications as read. Send {ids:[...]} or {all:true}."""
    if "user" not in session:
        return jsonify(success=False, error="Not logged in"), 401
    data = request.get_json(force=True)
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not user:
        db.close()
        return jsonify(success=False), 404
    if data.get("all"):
        db.execute("UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0", (user["id"],))
    else:
        ids = data.get("ids", [])
        for nid in ids:
            db.execute("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?", (int(nid), user["id"]))
    db.commit()
    db.close()
    return jsonify(success=True)


@app.route("/api/notifications/count")
def api_notifications_count():
    """Quick poll: return only unread count."""
    if "user" not in session:
        return jsonify(success=True, unread=0)
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not user:
        db.close()
        return jsonify(success=False, unread=0), 404
    unread = db.execute(
        "SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND is_read=0",
        (user["id"],)
    ).fetchone()["c"]
    db.close()
    return jsonify(success=True, unread=unread)


# ══════════════════════════════════════════════════════════════════════════════
#  DAILY FARM BRIEFING — Gemini-generated personalised morning briefing
# ══════════════════════════════════════════════════════════════════════════════

def _gather_briefing_data(user_id, city="", crops=""):
    """Collect weather, sensor, mandi, alerts data for briefing generation."""
    data = {"weather": {}, "sensor": {}, "mandi": [], "alerts": [], "schemes": []}

    # Weather
    if city:
        try:
            resp = http_requests.get(
                f"https://wttr.in/{city}?format=j1",
                headers={"User-Agent": "KisanSalahkar/2.0"}, timeout=8,
            )
            w = resp.json()
            cur = w["current_condition"][0]
            data["weather"] = {
                "city": city,
                "temp": cur["temp_C"],
                "humidity": cur["humidity"],
                "desc": cur["weatherDesc"][0]["value"],
                "forecast": [
                    {"date": d["date"], "max": d["maxtempC"], "min": d["mintempC"],
                     "desc": d["hourly"][4]["weatherDesc"][0]["value"]}
                    for d in w.get("weather", [])[:3]
                ],
            }
        except Exception:
            pass

    # Sensor data
    try:
        db = get_db()
        row = db.execute(
            "SELECT * FROM sensor_readings ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        if row:
            data["sensor"] = {
                "temperature": round(row["temperature"], 1),
                "humidity": round(row["humidity"], 1),
                "moisture": round(row["moisture"], 1) if row["moisture"] else None,
                "ph": round(row["ph"], 1) if row["ph"] else None,
            }
        db.close()
    except Exception:
        pass

    # Mandi prices for user's crops
    crop_list = [c.strip() for c in crops.split(",") if c.strip()] if crops else []
    if crop_list:
        try:
            resp = http_requests.get(
                "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
                params={"api-key": "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b",
                        "format": "json", "limit": 50,
                        "filters[commodity]": crop_list[0]},
                timeout=8,
            )
            records = resp.json().get("records", [])[:5]
            data["mandi"] = [
                {"crop": r.get("commodity", ""), "market": r.get("market", ""),
                 "price": r.get("modal_price", ""), "state": r.get("state", "")}
                for r in records
            ]
        except Exception:
            pass

    # Active alerts for user
    try:
        db = get_db()
        notifs = db.execute(
            "SELECT title, body FROM notifications WHERE user_id=? AND is_read=0 ORDER BY created_at DESC LIMIT 5",
            (user_id,)
        ).fetchall()
        data["alerts"] = [{"title": n["title"], "body": n["body"]} for n in notifs]
        db.close()
    except Exception:
        pass

    # Season
    month = datetime.now().month
    if month in (6, 7, 8, 9):
        data["season"] = "Kharif (monsoon)"
    elif month in (10, 11, 12, 1, 2):
        data["season"] = "Rabi (winter)"
    else:
        data["season"] = "Zaid (summer)"
    data["date"] = datetime.now().strftime("%d %B %Y, %A")
    return data


BRIEFING_PROMPT = """Generate a concise Daily Farm Briefing in Hinglish (Hindi + English mix) for an Indian farmer.

DATA PROVIDED:
{data}

FORMAT (use these exact section headers with emojis):
🌅 Good Morning Greeting (1 line with date)
🌦️ Mausam Update (temperature, humidity, 3-day outlook, farming impact)
📡 Sensor Status (if available — soil moisture, temp, pH with action items)
📊 Mandi Bhav (top crop prices if available)
⚠️ Alerts (any unread alerts/warnings)
🌾 Aaj Ka Kaam (3-4 specific tasks for today based on season + weather + sensor data)
💡 Expert Tip (1 seasonal farming tip)

RULES:
- Max 300 words total
- Be specific with numbers and actions
- Use farmer-friendly language
- If sensor shows low moisture → suggest irrigation
- If high humidity → warn about fungal disease
- End with one motivational line"""


@app.route("/api/briefing/generate", methods=["POST"])
def api_briefing_generate():
    """Generate a daily farm briefing using Gemini AI."""
    if "user" not in session:
        return jsonify(success=False, error="Login required"), 401

    data = request.get_json(force=True)
    city = bleach.clean(data.get("city", "").strip())
    crops = bleach.clean(data.get("crops", "").strip())

    db = get_db()
    u = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not u:
        db.close()
        return jsonify(success=False, error="User not found"), 404
    user_id = u["id"]

    # Check if already generated today
    today = datetime.now().strftime("%Y-%m-%d")
    existing = db.execute(
        "SELECT briefing, weather, sensor, mandi, alerts FROM daily_briefings WHERE user_id=? AND date=?",
        (user_id, today)
    ).fetchone()
    if existing and not data.get("force"):
        db.close()
        return jsonify(success=True, briefing=existing["briefing"],
                       weather=json.loads(existing["weather"]),
                       sensor=json.loads(existing["sensor"]),
                       mandi=json.loads(existing["mandi"]),
                       alerts=json.loads(existing["alerts"]),
                       cached=True)

    # Gather data
    bdata = _gather_briefing_data(user_id, city, crops)

    # Generate with Gemini
    briefing_text = ""
    if _init_gemini() and GEMINI_MODEL:
        try:
            prompt = BRIEFING_PROMPT.format(data=json.dumps(bdata, indent=2, ensure_ascii=False))
            resp = GEMINI_MODEL.generate_content(prompt)
            briefing_text = resp.text.strip()
        except Exception as e:
            print(f"⚠️  Briefing generation error: {e}")

    if not briefing_text:
        # Fallback briefing
        w = bdata.get("weather", {})
        s = bdata.get("sensor", {})
        briefing_text = f"""🌅 **Namaste Kisan Bhai!** — {bdata.get('date', 'Today')}

🌦️ **Mausam Update**
{f"📍 {w.get('city', 'Your area')}: {w.get('temp', '--')}°C, Humidity {w.get('humidity', '--')}%, {w.get('desc', '')}" if w else "Weather data unavailable — please set your city."}

📡 **Sensor Status**
{f"🌡️ Temp: {s.get('temperature', '--')}°C | 💧 Moisture: {s.get('moisture', '--')}% | pH: {s.get('ph', '--')}" if s else "No sensor data — connect your ESP32 device."}

🌾 **Aaj Ka Kaam**
• Subah ki sinchai karein (6-8 AM best time)
• Fasal ki regular checking karein
• Mandi bhav check karein — best selling time identify karein

💡 **Tip:** {bdata.get('season', 'Current season')} mein apni fasal ka dhyan rakhein!

Jai Jawan, Jai Kisan! 🇮🇳"""

    # Save to DB
    db.execute(
        "INSERT OR REPLACE INTO daily_briefings (user_id, date, briefing, weather, sensor, mandi, alerts) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, today, briefing_text,
         json.dumps(bdata.get("weather", {})),
         json.dumps(bdata.get("sensor", {})),
         json.dumps(bdata.get("mandi", [])),
         json.dumps(bdata.get("alerts", [])))
    )
    db.commit()

    # Also create an in-app notification
    _notify(user_id, "briefing", "🌅 Daily Farm Briefing Ready",
            "Your personalised morning briefing is ready. Tap to view.",
            "/dashboard#briefing")

    db.close()
    return jsonify(success=True, briefing=briefing_text,
                   weather=bdata.get("weather", {}),
                   sensor=bdata.get("sensor", {}),
                   mandi=bdata.get("mandi", []),
                   alerts=bdata.get("alerts", []),
                   cached=False)


@app.route("/api/briefing/latest")
def api_briefing_latest():
    """Get the latest briefing for the logged-in user."""
    if "user" not in session:
        return jsonify(success=False, error="Login required"), 401
    db = get_db()
    u = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not u:
        db.close()
        return jsonify(success=True, briefing=None)
    row = db.execute(
        "SELECT * FROM daily_briefings WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
        (u["id"],)
    ).fetchone()
    db.close()
    if not row:
        return jsonify(success=True, briefing=None)
    return jsonify(success=True, briefing=row["briefing"], date=row["date"],
                   weather=json.loads(row["weather"]),
                   sensor=json.loads(row["sensor"]),
                   mandi=json.loads(row["mandi"]),
                   alerts=json.loads(row["alerts"]))


@app.route("/api/briefing/schedule", methods=["GET", "POST"])
def api_briefing_schedule():
    """Get or set daily briefing schedule."""
    if "user" not in session:
        return jsonify(success=False, error="Login required"), 401
    db = get_db()
    u = db.execute("SELECT id FROM users WHERE username=?", (session["user"]["username"],)).fetchone()
    if not u:
        db.close()
        return jsonify(success=False), 404
    user_id = u["id"]

    if request.method == "GET":
        sched = db.execute(
            "SELECT * FROM briefing_schedule WHERE user_id=?", (user_id,)
        ).fetchone()
        db.close()
        if sched:
            return jsonify(success=True, schedule=dict(sched))
        return jsonify(success=True, schedule=None)

    # POST — save schedule
    data = request.get_json(force=True)
    enabled = 1 if data.get("enabled", True) else 0
    time_hour = max(0, min(23, int(data.get("time_hour", 6))))
    time_min = max(0, min(59, int(data.get("time_min", 0))))
    delivery = data.get("delivery", "app")
    if delivery not in ("app", "sms", "whatsapp"):
        delivery = "app"
    phone = bleach.clean(data.get("phone", "").strip())
    city = bleach.clean(data.get("city", "").strip())
    crops = bleach.clean(data.get("crops", "").strip())

    db.execute("""
        INSERT INTO briefing_schedule (user_id, enabled, time_hour, time_min, delivery, phone, city, crops)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            enabled=excluded.enabled, time_hour=excluded.time_hour, time_min=excluded.time_min,
            delivery=excluded.delivery, phone=excluded.phone, city=excluded.city, crops=excluded.crops
    """, (user_id, enabled, time_hour, time_min, delivery, phone, city, crops))
    db.commit()
    db.close()
    return jsonify(success=True, message="Briefing schedule saved!")


# ══════════════════════════════════════════════════════════════════════════════
#  CHATBOT QUICK ACTIONS — Execute real API calls from chat
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/chat/action", methods=["POST"])
def api_chat_action():
    """Execute a quick action from chatbot — fetch real data and return summary."""
    data = request.get_json(force=True)
    action = data.get("action", "")
    params = data.get("params", {})

    result = {"success": False, "action": action}

    if action == "weather":
        city = bleach.clean(params.get("city", "Delhi"))
        try:
            resp = http_requests.get(
                f"https://wttr.in/{city}?format=j1",
                headers={"User-Agent": "KisanSalahkar/2.0"}, timeout=8,
            )
            w = resp.json()
            cur = w["current_condition"][0]
            fc = w.get("weather", [])[:2]
            result = {
                "success": True, "action": "weather",
                "summary": f"📍 {city}: {cur['temp_C']}°C, {cur['weatherDesc'][0]['value']}, "
                           f"Humidity {cur['humidity']}%\n"
                           f"🔮 Kal: {fc[1]['maxtempC']}°C/{fc[1]['mintempC']}°C — {fc[1]['hourly'][4]['weatherDesc'][0]['value']}" if len(fc) > 1 else "",
                "data": {"temp": cur["temp_C"], "humidity": cur["humidity"],
                         "desc": cur["weatherDesc"][0]["value"], "city": city},
            }
        except Exception as e:
            result["error"] = str(e)

    elif action == "sensor":
        try:
            db = get_db()
            row = db.execute(
                "SELECT * FROM sensor_readings ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
            db.close()
            if row:
                result = {
                    "success": True, "action": "sensor",
                    "summary": f"📡 Live Sensor:\n🌡️ Temp: {round(row['temperature'],1)}°C\n"
                               f"💧 Humidity: {round(row['humidity'],1)}%\n"
                               f"🌱 Soil Moisture: {round(row['moisture'],1) if row['moisture'] else 'N/A'}%\n"
                               f"⚗️ pH: {round(row['ph'],1) if row['ph'] else 'N/A'}",
                    "data": {"temperature": round(row["temperature"], 1),
                             "humidity": round(row["humidity"], 1),
                             "moisture": round(row["moisture"], 1) if row["moisture"] else None,
                             "ph": round(row["ph"], 1) if row["ph"] else None},
                }
            else:
                result = {"success": True, "action": "sensor",
                          "summary": "📡 No sensor data available. ESP32 connect karein.",
                          "data": None}
        except Exception as e:
            result["error"] = str(e)

    elif action == "mandi":
        crop = bleach.clean(params.get("crop", "wheat"))
        try:
            resp = http_requests.get(
                "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
                params={"api-key": "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b",
                        "format": "json", "limit": 5,
                        "filters[commodity]": crop},
                timeout=8,
            )
            records = resp.json().get("records", [])[:5]
            if records:
                lines = [f"📊 **{crop.title()} Mandi Prices:**"]
                for r in records:
                    lines.append(f"• {r.get('market', '?')}, {r.get('state', '?')} — ₹{r.get('modal_price', '?')}/q")
                result = {"success": True, "action": "mandi",
                          "summary": "\n".join(lines), "data": records}
            else:
                result = {"success": True, "action": "mandi",
                          "summary": f"📊 {crop.title()} ke liye koi mandi data nahi mila.", "data": []}
        except Exception as e:
            result["error"] = str(e)

    elif action == "briefing":
        # Generate today's briefing
        if "user" in session:
            try:
                db = get_db()
                u = db.execute("SELECT id FROM users WHERE username=?",
                               (session["user"]["username"],)).fetchone()
                if u:
                    city = params.get("city", "")
                    crops = params.get("crops", "")
                    bdata = _gather_briefing_data(u["id"], city, crops)
                    result = {"success": True, "action": "briefing",
                              "summary": f"🌅 Briefing data gathered for {bdata.get('date', 'today')}",
                              "data": bdata}
                db.close()
            except Exception as e:
                result["error"] = str(e)
        else:
            result["error"] = "Login required"

    else:
        result["error"] = f"Unknown action: {action}"

    return jsonify(result)


# ══════════════════════════════════════════════════════════════════════════════
#  VOICE COMMAND API — Process voice commands server-side
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/voice/command", methods=["POST"])
def api_voice_command():
    """Process a voice command: parse intent, execute action, return spoken response."""
    data = request.get_json(force=True)
    text = bleach.clean(data.get("text", "").strip())
    lang = data.get("lang", "hi")

    if not text:
        return jsonify(success=False, error="No voice input"), 400

    t = text.lower()

    # ── Intent detection with keyword matching (fast path) ──
    intent = None
    params = {}

    # Weather intent
    if any(w in t for w in ["mausam", "weather", "barish", "rain", "thand", "garmi", "मौसम", "बारिश"]):
        intent = "weather"
        # Try to extract city name
        for prefix in ["mausam", "weather", "mausam kaisa hai", "weather in", "mausam batao"]:
            if prefix in t:
                city = t.replace(prefix, "").strip().strip("?।")
                if city and len(city) > 1:
                    params["city"] = city.title()
                break

    # Sensor intent
    elif any(w in t for w in ["sensor", "device", "iot", "data", "moisture", "temperature",
                               "सेंसर", "डिवाइस", "नमी"]):
        intent = "sensor"

    # Mandi intent
    elif any(w in t for w in ["mandi", "bhav", "price", "rate", "daam", "मंडी", "भाव", "दाम"]):
        intent = "mandi"
        for crop_word in ["wheat", "rice", "gehun", "chawal", "dal", "tomato", "onion", "potato",
                          "soybean", "cotton", "mustard", "chana", "sarson", "गेहूं", "चावल", "दाल",
                          "टमाटर", "प्याज", "आलू"]:
            if crop_word in t:
                # Map Hindi to English
                crop_map = {"gehun": "wheat", "chawal": "rice", "sarson": "mustard",
                            "गेहूं": "wheat", "चावल": "rice", "दाल": "dal",
                            "टमाटर": "tomato", "प्याज": "onion", "आलू": "potato"}
                params["crop"] = crop_map.get(crop_word, crop_word)
                break

    # Navigation intents
    elif any(w in t for w in ["crop", "fasal", "prediction", "खेती", "फसल"]):
        intent = "navigate"
        params["page"] = "/crop"
    elif any(w in t for w in ["disease", "rog", "bimari", "रोग", "बीमारी"]):
        intent = "navigate"
        params["page"] = "/disease"
    elif any(w in t for w in ["scheme", "yojana", "sarkari", "योजना", "सरकारी"]):
        intent = "navigate"
        params["page"] = "/schemes"
    elif any(w in t for w in ["soil", "mitti", "मिट्टी"]):
        intent = "navigate"
        params["page"] = "/soil"
    elif any(w in t for w in ["forum", "sawaal", "community", "फोरम"]):
        intent = "navigate"
        params["page"] = "/forum"
    elif any(w in t for w in ["dashboard", "home", "ghar", "होम"]):
        intent = "navigate"
        params["page"] = "/dashboard"
    elif any(w in t for w in ["briefing", "subah", "morning", "report", "ब्रीफिंग"]):
        intent = "briefing"
    elif any(w in t for w in ["marketplace", "bazaar", "sell", "buy", "khareed", "bech",
                               "बाज़ार", "बेच", "खरीद"]):
        intent = "navigate"
        params["page"] = "/marketplace"

    # If no keyword match, use Gemini for intent parsing
    if not intent and _init_gemini() and GEMINI_MODEL:
        try:
            parse_prompt = f"""Parse this Hindi/English farmer voice command and return JSON only:
Command: "{text}"
Return format: {{"intent": "weather|sensor|mandi|crop|disease|scheme|soil|navigate|question", "params": {{}}, "spoken_response": "short Hindi response"}}
If it's a general farming question, use intent "question"."""
            resp = GEMINI_MODEL.generate_content(parse_prompt)
            parsed = resp.text.strip()
            # Extract JSON from response
            if "{" in parsed:
                json_str = parsed[parsed.index("{"):parsed.rindex("}") + 1]
                parsed_data = json.loads(json_str)
                intent = parsed_data.get("intent", "question")
                params = parsed_data.get("params", {})
        except Exception:
            intent = "question"

    if not intent:
        intent = "question"

    # ── Execute intent ──
    response = {"success": True, "intent": intent, "params": params}

    if intent == "weather":
        city = params.get("city", "Delhi")
        try:
            resp = http_requests.get(
                f"https://wttr.in/{city}?format=j1",
                headers={"User-Agent": "KisanSalahkar/2.0"}, timeout=8,
            )
            w = resp.json()
            cur = w["current_condition"][0]
            response["speak"] = (
                f"{city} mein aaj {cur['temp_C']} degree temperature hai. "
                f"Humidity {cur['humidity']} percent. {cur['weatherDesc'][0]['value']}. "
            )
            fc = w.get("weather", [])
            if len(fc) > 1:
                response["speak"] += f"Kal ka mausam: {fc[1]['maxtempC']} degree max, {fc[1]['mintempC']} degree min."
            response["data"] = {"temp": cur["temp_C"], "humidity": cur["humidity"],
                                "desc": cur["weatherDesc"][0]["value"]}
        except Exception:
            response["speak"] = f"{city} ka mausam abhi fetch nahi ho paya. Thodi der baad try karein."

    elif intent == "sensor":
        try:
            db = get_db()
            row = db.execute("SELECT * FROM sensor_readings ORDER BY created_at DESC LIMIT 1").fetchone()
            db.close()
            if row:
                response["speak"] = (
                    f"Sensor data: Temperature {round(row['temperature'],1)} degree, "
                    f"Humidity {round(row['humidity'],1)} percent, "
                    f"Soil moisture {round(row['moisture'],1) if row['moisture'] else 'unavailable'} percent, "
                    f"pH {round(row['ph'],1) if row['ph'] else 'unavailable'}."
                )
                if row["moisture"] and row["moisture"] < 25:
                    response["speak"] += " Warning: Soil moisture bahut kam hai! Turant sinchai karein."
                if row["temperature"] > 40:
                    response["speak"] += " Temperature bahut zyada hai — crop ko shade dein."
            else:
                response["speak"] = "Abhi koi sensor data available nahi hai. ESP32 device connect karein."
        except Exception:
            response["speak"] = "Sensor data fetch karne mein error aaya."

    elif intent == "mandi":
        crop = params.get("crop", "wheat")
        try:
            resp = http_requests.get(
                "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
                params={"api-key": "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b",
                        "format": "json", "limit": 3,
                        "filters[commodity]": crop},
                timeout=8,
            )
            records = resp.json().get("records", [])[:3]
            if records:
                response["speak"] = f"{crop.title()} ke mandi bhav: "
                for r in records:
                    response["speak"] += f"{r.get('market', '?')} mein {r.get('modal_price', '?')} rupaye per quintal. "
            else:
                response["speak"] = f"{crop.title()} ke liye mandi data nahi mila."
        except Exception:
            response["speak"] = "Mandi data fetch nahi ho paya."

    elif intent == "navigate":
        page = params.get("page", "/dashboard")
        page_names = {"/crop": "Crop Advice", "/weather": "Weather", "/mandi": "Mandi Prices",
                      "/disease": "Disease Detection", "/schemes": "Government Schemes",
                      "/soil": "Soil Test", "/forum": "Farmer Forum", "/dashboard": "Dashboard",
                      "/marketplace": "Marketplace"}
        response["speak"] = f"{page_names.get(page, page)} page khol raha hoon."
        response["navigate"] = page

    elif intent == "briefing":
        response["speak"] = "Aapka daily briefing generate kar raha hoon."
        response["trigger"] = "briefing"

    elif intent == "question":
        # Pass to Gemini for a spoken answer
        if _init_gemini() and GEMINI_MODEL:
            try:
                context = _build_chat_context()
                prompt = (
                    f"[VOICE COMMAND — speak naturally in Hinglish, max 3 sentences]\n"
                    f"[CONTEXT]\n{context}\n\n"
                    f"[FARMER ASKED]\n{text}"
                )
                resp = GEMINI_MODEL.generate_content(prompt)
                response["speak"] = resp.text.strip()
            except Exception:
                response["speak"] = "Maaf karein, abhi jawab nahi de paya. Thodi der baad try karein."
        else:
            response["speak"] = "AI assistant abhi available nahi hai. Kripya baad mein try karein."

    return jsonify(response)


# ══════════════════════════════════════════════════════════════════════════════
#  GLOBAL SEARCH API
# ══════════════════════════════════════════════════════════════════════════════
@app.route("/api/search")
def api_global_search():
    """Unified search across pages, crops, schemes, forum, marketplace."""
    q = request.args.get("q", "").strip().lower()
    if not q or len(q) < 2:
        return jsonify(success=True, results=[])
    results = []
    # ── Static pages ──
    pages = [
        {"title": "Dashboard",          "icon": "house",           "type": "page", "url": "/dashboard"},
        {"title": "Crop Advice",        "icon": "seedling",        "type": "page", "url": "/crop"},
        {"title": "Weather Forecast",   "icon": "cloud-sun",       "type": "page", "url": "/weather"},
        {"title": "Mandi Prices",       "icon": "store",           "type": "page", "url": "/mandi"},
        {"title": "Marketplace",        "icon": "handshake",       "type": "page", "url": "/marketplace"},
        {"title": "Disease Detection",  "icon": "virus",           "type": "page", "url": "/disease"},
        {"title": "Government Schemes", "icon": "landmark",        "type": "page", "url": "/schemes"},
        {"title": "Soil Test",          "icon": "flask-vial",      "type": "page", "url": "/soil"},
        {"title": "Farmer Forum",       "icon": "comments",        "type": "page", "url": "/forum"},
        {"title": "Alerts & SMS",       "icon": "bell",            "type": "page", "url": "/alerts"},
        {"title": "IoT Sensors",        "icon": "microchip",       "type": "page", "url": "/iot"},
        {"title": "Agricultural Info",  "icon": "book-open",       "type": "page", "url": "/info"},
        {"title": "Profile Settings",   "icon": "user-circle",     "type": "page", "url": "/profile"},
    ]
    for p in pages:
        if q in p["title"].lower():
            results.append(p)
    # ── Crops from MSP_DATA ──
    for crop, price in MSP_DATA.items():
        if q in crop.lower():
            results.append({"title": crop, "sub": f"MSP: ₹{price}/q", "icon": "seedling", "type": "crop", "url": f"/crop?crop={crop}"})
    # ── Government Schemes ──
    for s in GOVT_SCHEMES:
        if q in s["name"].lower() or q in s.get("name_hi", "").lower() or q in s.get("desc", "").lower():
            results.append({"title": s["name"], "sub": s.get("benefits", ""), "icon": "landmark", "type": "scheme", "url": "/schemes"})
    # ── Forum posts ──
    if "user" in session:
        try:
            db = get_db()
            posts = db.execute(
                "SELECT id, title, category FROM forum_posts WHERE title LIKE ? LIMIT 5",
                (f"%{q}%",)
            ).fetchall()
            for p in posts:
                results.append({"title": p["title"], "sub": p["category"], "icon": "comments", "type": "forum", "url": "/forum"})
            # ── Marketplace listings ──
            listings = db.execute(
                "SELECT id, crop, location, ask_price FROM market_listings WHERE crop LIKE ? AND status='active' LIMIT 5",
                (f"%{q}%",)
            ).fetchall()
            for l in listings:
                results.append({"title": f"{l['crop']} — ₹{l['ask_price']}/q", "sub": l["location"] or "Marketplace", "icon": "handshake", "type": "market", "url": "/marketplace"})
            db.close()
        except Exception:
            pass
    return jsonify(success=True, results=results[:20])


if __name__ == "__main__":
  #  init_db()
    # Try to init Gemini at startup if key is set
   # if GEMINI_API_KEY in os.environ:
  #      _init_gemini()
    port=int(os.environ.get("PORT", 10000))
    app.run(debug=True, host="0.0.0.0", port=port)
