/* ================================================================
   main.js — Frontend logic for Kisan Salahkar (Full Featured)
   Features: Auth, Crop, Weather, Mandi, Disease, Schemes, Soil,
             Forum, Alerts, Voice Input/TTS
   ================================================================ */

// ── Helpers ──────────────────────────────────────────────────────
function toast(msg, type = "info") {
    const box = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4500);
}

// Global loading overlay
let _loadingCount = 0;
function showLoading(msg) {
    _loadingCount++;
    let overlay = document.getElementById("globalLoadingOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "globalLoadingOverlay";
        overlay.className = "loading-overlay";
        overlay.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p class="loading-text"></p></div>`;
        document.body.appendChild(overlay);
    }
    overlay.querySelector(".loading-text").textContent = msg || "Loading...";
    overlay.classList.add("active");
}
function hideLoading() {
    _loadingCount = Math.max(0, _loadingCount - 1);
    if (_loadingCount === 0) {
        const overlay = document.getElementById("globalLoadingOverlay");
        if (overlay) overlay.classList.remove("active");
    }
}

async function api(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error || "Request failed");
    return data;
}

function t(key) { return LangManager.t(key); }

// ── Navbar toggle (mobile) ──────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("navToggle");
    const links = document.getElementById("navLinks");
    if (toggle && links) {
        toggle.addEventListener("click", () => links.classList.toggle("open"));
    }

    // More-dropdown click for mobile (hover doesn't work on touch)
    const dropBtn = document.querySelector(".nav-dropdown-toggle");
    const dropMenu = document.querySelector(".nav-dropdown-menu");
    if (dropBtn && dropMenu) {
        dropBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dropMenu.classList.toggle("show");
            dropBtn.classList.toggle("active");
        });
        document.addEventListener("click", () => {
            dropMenu.classList.remove("show");
            dropBtn.classList.remove("active");
        });
    }

    LangManager.init();

    // ── Bottom Nav: highlight active item ──
    const path = window.location.pathname;
    document.querySelectorAll(".bottom-nav-item").forEach(a => {
        if (a.getAttribute("href") === path) a.classList.add("active");
    });
});

// ================================================================
//  VOICE INPUT & TEXT-TO-SPEECH (Feature 4)
// ================================================================
let recognition = null;
function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = LangManager.current === "hi" ? "hi-IN" : "en-IN";
    return recognition;
}

function startVoiceInput() {
    const sr = initSpeechRecognition();
    if (!sr) { toast("Voice input not supported in this browser", "error"); return; }
    const btn = document.getElementById("voiceBtn");
    if (btn) btn.classList.add("listening");
    sr.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const result = document.getElementById("voiceResult");
        if (result) { result.style.display = "block"; result.textContent = `🎤 "${text}"`; }
        processVoiceCommand(text);
    };
    sr.onerror = () => { if (btn) btn.classList.remove("listening"); toast(t("voiceError") || "Voice error", "error"); };
    sr.onend = () => { if (btn) btn.classList.remove("listening"); };
    sr.start();
}

function processVoiceCommand(text) {
    const t = text.toLowerCase();
    if (t.includes("crop") || t.includes("फसल")) location.href = "/crop";
    else if (t.includes("weather") || t.includes("mausam") || t.includes("मौसम")) location.href = "/weather";
    else if (t.includes("mandi") || t.includes("price") || t.includes("भाव") || t.includes("मंडी")) location.href = "/mandi";
    else if (t.includes("disease") || t.includes("rog") || t.includes("रोग")) location.href = "/disease";
    else if (t.includes("scheme") || t.includes("yojana") || t.includes("योजना")) location.href = "/schemes";
    else if (t.includes("soil") || t.includes("mitti") || t.includes("मिट्टी")) location.href = "/soil";
    else if (t.includes("forum") || t.includes("community") || t.includes("समुदाय")) location.href = "/forum";
    else toast(`"${text}" — ${LangManager.t("voiceNotUnderstood") || "Try: crop, weather, mandi, disease, scheme"}`, "info");
}

function voiceFillCropForm() {
    const sr = initSpeechRecognition();
    if (!sr) { toast("Voice not supported", "error"); return; }
    toast(LangManager.t("voiceListening") || "Listening... say values like 'Nitrogen 90, Phosphorus 45'", "info");
    sr.onresult = (e) => {
        const text = e.results[0][0].transcript.toLowerCase();
        const nums = text.match(/\d+\.?\d*/g);
        if (nums && nums.length >= 4) {
            const fields = ["nitrogen", "phosphorus", "potassium", "ph", "temperature", "humidity", "rainfall"];
            nums.forEach((n, i) => { if (fields[i]) { const el = document.getElementById(fields[i]); if (el) el.value = n; } });
            toast(LangManager.t("voiceFilled") || "Values filled from voice!", "success");
        } else {
            toast(LangManager.t("voiceRetry") || "Please say at least 4 numbers", "info");
        }
    };
    sr.start();
}

function voiceDiseaseInput() {
    const sr = initSpeechRecognition();
    if (!sr) { toast("Voice not supported", "error"); return; }
    toast("Listening... describe the symptoms", "info");
    sr.onresult = (e) => {
        document.getElementById("diseaseSymptoms").value = e.results[0][0].transcript;
        toast("Symptoms recorded!", "success");
    };
    sr.start();
}

function speakText(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LangManager.current === "hi" ? "hi-IN" : "en-IN";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
}

// ================================================================
//  AUTH — Login & Signup
// ================================================================
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
            tab.classList.add("active");
            const target = tab.dataset.tab === "login" ? "loginForm" : "signupForm";
            document.getElementById(target)?.classList.add("active");
        });
    });

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async e => {
            e.preventDefault();
            try {
                await api("/api/login", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: document.getElementById("loginUsername").value.trim(),
                        password: document.getElementById("loginPassword").value,
                    }),
                });
                toast(t("loginOk"), "success");
                setTimeout(() => (location.href = "/dashboard"), 600);
            } catch (err) { toast(err.message, "error"); }
        });
    }

    const signupForm = document.getElementById("signupForm");
    if (signupForm) {
        signupForm.addEventListener("submit", async e => {
            e.preventDefault();
            try {
                await api("/api/signup", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: document.getElementById("signupName").value.trim(),
                        username: document.getElementById("signupUsername").value.trim(),
                        password: document.getElementById("signupPassword").value,
                        phone: document.getElementById("signupPhone")?.value.trim() || "",
                        state: document.getElementById("signupState")?.value || "",
                        location: document.getElementById("signupCity")?.value.trim() || "",
                    }),
                });
                toast(t("signupOk"), "success");
                setTimeout(() => (location.href = "/dashboard"), 600);
            } catch (err) { toast(err.message, "error"); }
        });
    }
});

// ================================================================
//  SOIL PRESETS — Auto-fill typical NPK/pH for common soil types
// ================================================================
const SOIL_PRESETS = {
    alluvial: { ph: 7.0, moisture: 55, label: "Alluvial Soil" },
    black:    { ph: 7.8, moisture: 65, label: "Black Cotton Soil" },
    red:      { ph: 6.0, moisture: 35, label: "Red Soil" },
    laterite: { ph: 5.5, moisture: 30, label: "Laterite Soil" },
    sandy:    { ph: 7.5, moisture: 20, label: "Sandy/Desert Soil" },
    clayey:   { ph: 6.8, moisture: 70, label: "Clayey Soil" },
    loamy:    { ph: 6.5, moisture: 50, label: "Loamy Soil" },
};

function applySoilPreset(type) {
    if (!type || !SOIL_PRESETS[type]) return;
    const p = SOIL_PRESETS[type];
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal("ph", p.ph);
    setVal("soilMoisture", p.moisture);
    toast(`${p.label} — pH & Moisture filled (pH=${p.ph}, Moisture=${p.moisture}%). Use Sensor Fill for NPK.`, "success");
}

// ================================================================
//  CROP PREDICTION
// ================================================================
let cropChart = null;
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("cropForm");
    if (!form) return;

    // Auto-select state from user's saved location
    const stateEl = document.getElementById("stateSelect");
    const districtEl = document.getElementById("districtSelect");

    const setDistrictOptions = (districts = []) => {
        if (!districtEl) return;
        districtEl.innerHTML = `<option value="">-- Select District (Optional) --</option>`;
        districts.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d;
            opt.textContent = d;
            districtEl.appendChild(opt);
        });
        districtEl.disabled = districts.length === 0;
    };

    const loadDistricts = async (state) => {
        if (!districtEl) return;
        if (!state) {
            setDistrictOptions([]);
            return;
        }

        try {
            const data = await api(`/api/state-districts?state=${encodeURIComponent(state)}`);
            setDistrictOptions(data.districts || []);
        } catch (_) {
            setDistrictOptions([]);
        }
    };

    if (stateEl && window.USER_DEFAULTS?.state) {
        stateEl.value = window.USER_DEFAULTS.state;
    }

    if (stateEl) {
        loadDistricts(stateEl.value || "").then(() => {
            // Auto-fill district from profile if available
            if (districtEl && window.USER_DEFAULTS?.district) {
                districtEl.value = window.USER_DEFAULTS.district;
                autoFillRainfall();
            }
        });
        stateEl.addEventListener("change", () => {
            loadDistricts(stateEl.value || "");
            autoFillRainfall();
        });
    }

    // Auto-fill rainfall when season or district changes
    const seasonEl = document.getElementById("seasonSelect");
    if (seasonEl) seasonEl.addEventListener("change", autoFillRainfall);
    if (districtEl) districtEl.addEventListener("change", autoFillRainfall);

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const btn = document.getElementById("predictBtn");
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t("predicting")}`;
        showLoading(LangManager.current === "hi" ? "फसल की सिफारिश प्राप्त हो रही है..." : "Getting crop recommendation...");

        const payload = {
            N: document.getElementById("nitrogen").value,
            P: document.getElementById("phosphorus").value,
            K: document.getElementById("potassium").value,
            temperature: document.getElementById("temperature").value,
            humidity: document.getElementById("humidity").value,
            pH: document.getElementById("ph").value,
            rainfall: document.getElementById("rainfall").value,
            soil_moisture: document.getElementById("soilMoisture")?.value || "",
            state: document.getElementById("stateSelect")?.value || "",
            district: document.getElementById("districtSelect")?.value || "",
            season: document.getElementById("seasonSelect")?.value || "",
        };

        try {
            const data = await api("/api/predict", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            renderCropResults(data.predictions, data.moisture_advisory, data);
            // Cache prediction offline
            try { localStorage.setItem("lastCropPrediction", JSON.stringify({ predictions: data.predictions, moisture_advisory: data.moisture_advisory, input_used: data.input_used, ts: Date.now() })); } catch(_){}
            loadPredictionHistory();
            toast(t("predReady"), "success");
        } catch (err) {
            // Try showing cached result if offline
            const cached = getCachedPrediction();
            if (cached) {
                renderCropResults(cached.predictions, cached.moisture_advisory, { input_used: cached.input_used });
                toast(t("offlineResult") || "Showing cached result (offline)", "warning");
            } else {
                toast(err.message, "error");
            }
        }
        finally {
            hideLoading();
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-magnifying-glass-chart"></i> ${t("btnPredict")}`;
        }
    });
});

function renderCropResults(predictions, moistureAdvisory, fullData) {
    const card = document.getElementById("resultCard");
    card.style.display = "block";
    card.scrollIntoView({ behavior: "smooth", block: "start" });

    const top = predictions[0];
    const seasonBadges = (top.seasons || []).map(s => {
        const labels = {kharif: "Kharif ☔", rabi: "Rabi ❄️", zaid: "Zaid ☀️"};
        return `<span class="season-badge season-${s}">${labels[s] || s}</span>`;
    }).join(" ");

    // Crop emoji map
    const cropEmoji = { Rice: "🌾", Wheat: "🌾", Maize: "🌽", Cotton: "🏵️", Sugarcane: "🎋", Coffee: "☕", Tea: "🍵", Banana: "🍌", Mango: "🥭", Coconut: "🥥", Potato: "🥔", Tomato: "🍅", Onion: "🧅", Chili: "🌶️", Groundnut: "🥜", Soybean: "🫘", Lentil: "🫘", Chickpea: "🫘" };
    const emoji = cropEmoji[top.crop] || "🌱";

    // Crop image map — Unsplash photos for each crop
    const CROP_IMAGES = {
        Rice:       "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=600&h=400&fit=crop",
        Wheat:      "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=600&h=400&fit=crop",
        Maize:      "https://images.unsplash.com/photo-1440342359743-84fcb8c21f21?w=600&h=400&fit=crop",
        Cotton:     "https://images.unsplash.com/photo-1601472544834-243f5e5c5d70?w=600&h=400&fit=crop",
        Sugarcane:  "https://images.unsplash.com/photo-1601593768498-3540b8aa1f3d?w=600&h=400&fit=crop",
        Coffee:     "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&h=400&fit=crop",
        Tea:        "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=600&h=400&fit=crop",
        Banana:     "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&h=400&fit=crop",
        Mango:      "https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&h=400&fit=crop",
        Coconut:    "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=600&h=400&fit=crop",
        Potato:     "https://images.unsplash.com/photo-1518977676601-b53f82aba53e?w=600&h=400&fit=crop",
        Tomato:     "https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=600&h=400&fit=crop",
        Onion:      "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&h=400&fit=crop",
        Chili:      "https://images.unsplash.com/photo-1588891557811-a0f1a5d294e3?w=600&h=400&fit=crop",
        Groundnut:  "https://images.unsplash.com/photo-1567892737950-30c4db37cd89?w=600&h=400&fit=crop",
        Soybean:    "https://images.unsplash.com/photo-1599420186946-7b6fb4e297f0?w=600&h=400&fit=crop",
        Lentil:     "https://images.unsplash.com/photo-1515543904279-0a869b2b4cb2?w=600&h=400&fit=crop",
        Chickpea:   "https://images.unsplash.com/photo-1515543904279-0a869b2b4cb2?w=600&h=400&fit=crop",
        Mustard:    "https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=600&h=400&fit=crop",
        Jute:       "https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=600&h=400&fit=crop",
        Apple:      "https://images.unsplash.com/photo-1570913149827-d2ac84ab3f9a?w=600&h=400&fit=crop",
        Grapes:     "https://images.unsplash.com/photo-1596363505729-4190a9506133?w=600&h=400&fit=crop",
        Orange:     "https://images.unsplash.com/photo-1547514701-42782101795e?w=600&h=400&fit=crop",
        Watermelon: "https://images.unsplash.com/photo-1563114773-84221bd62daa?w=600&h=400&fit=crop",
        Papaya:     "https://images.unsplash.com/photo-1526318472351-c75fcf070305?w=600&h=400&fit=crop",
        Pomegranate:"https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&h=400&fit=crop",
    };
    const defaultCropImg = "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=400&fit=crop";
    const topCropImg = CROP_IMAGES[top.crop] || defaultCropImg;

    document.getElementById("topCrop").innerHTML = `
        <div class="top-crop-img-wrap">
            <img src="${topCropImg}" alt="${top.crop} field" class="top-crop-photo" loading="lazy">
            <div class="top-crop-img-overlay"></div>
        </div>
        <div class="top-crop-info">
            <div class="top-crop-emoji">${emoji}</div>
            <div class="crop-name">${top.crop}</div>
            <div class="crop-conf-meter">
                <div class="conf-ring" style="--conf: ${top.confidence}">
                    <svg viewBox="0 0 36 36"><path class="conf-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/><path class="conf-ring-fill" stroke-dasharray="${top.confidence}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/></svg>
                    <span class="conf-ring-text">${top.confidence}%</span>
                </div>
                <span class="conf-label">Confidence</span>
            </div>
            ${seasonBadges ? `<div class="crop-seasons">${seasonBadges}</div>` : ""}
        </div>
    `;

    // Data source summary
    const dsEl = document.getElementById("dataSourceSummary");
    if (dsEl) {
        const dataSources = [];
        const hasSensorBadge = document.querySelector(".sensor-badge");
        const hasAIBadge = document.querySelector(".ai-badge:not(.sensor-badge):not(.rainfall-badge)");
        const hasRainfallBadge = document.querySelector(".rainfall-badge");
        if (hasSensorBadge) dataSources.push('<span class="ds-chip ds-sensor"><i class="fa-solid fa-microchip"></i> ESP32 Sensors</span>');
        if (hasAIBadge) dataSources.push('<span class="ds-chip ds-ai"><i class="fa-solid fa-robot"></i> AI NPK Model</span>');
        if (hasRainfallBadge) dataSources.push('<span class="ds-chip ds-rain"><i class="fa-solid fa-cloud-rain"></i> Rainfall Estimate</span>');
        if (dataSources.length) {
            dsEl.innerHTML = `<div class="ds-label">Data sources used:</div><div class="ds-chips">${dataSources.join("")}</div>`;
            dsEl.style.display = "block";
        } else {
            dsEl.style.display = "none";
        }
    }

    const barsEl = document.getElementById("cropBars");
    const barColors = ["#27ae60", "#2ecc71", "#3498db", "#f39c12", "#e74c3c"];
    barsEl.innerHTML = predictions.map((p, i) => {
        const pImg = CROP_IMAGES[p.crop] || defaultCropImg;
        return `
        <div class="crop-bar-item">
            <div class="crop-bar-label">
                <span class="crop-bar-thumb-wrap"><img src="${pImg.replace('600','80').replace('400','80')}" alt="${p.crop}" class="crop-bar-thumb" loading="lazy"></span>
                <span>${cropEmoji[p.crop] || "🌱"} ${p.crop}</span>
                <span class="crop-bar-pct">${p.confidence}%</span>
            </div>
            <div class="crop-bar-track"><div class="crop-bar-fill" style="width:${p.confidence}%;background:${barColors[i] || barColors[0]}"></div></div>
        </div>`;
    }).join("");

    const ctx = document.getElementById("cropChart").getContext("2d");
    if (cropChart) cropChart.destroy();
    cropChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: predictions.map(p => p.crop),
            datasets: [{ data: predictions.map(p => p.confidence),
                backgroundColor: ["#27ae60", "#2ecc71", "#3498db", "#f39c12", "#e74c3c"], borderWidth: 2, borderColor: "#fff" }],
        },
        options: { responsive: true, plugins: { legend: { position: "bottom", labels: { padding: 16, font: { family: "Poppins", size: 13 } } } } },
    });

    // Tip
    const tipEl = document.getElementById("cropTip");
    const tipText = LangManager.current === "hi" && top.tip_hi ? top.tip_hi : top.tip;
    if (tipText) { tipEl.innerHTML = `<i class="fa-solid fa-lightbulb"></i> <strong>${t("growingTip")}:</strong> ${tipText}`; tipEl.style.display = "block"; }

    // Diseases
    if (top.diseases && top.diseases.length) {
        const dEl = document.getElementById("cropDiseases");
        dEl.style.display = "block";
        document.getElementById("diseaseList").innerHTML = top.diseases.map(d =>
            `<span class="disease-tag"><i class="fa-solid fa-virus"></i> ${d}</span>`
        ).join(" ");
    }

    // MSP
    if (top.msp) {
        const mEl = document.getElementById("cropMSP");
        mEl.style.display = "block";
        mEl.innerHTML = `<i class="fa-solid fa-rupee-sign"></i> <strong>MSP:</strong> ₹${top.msp}/quintal`;
    }

    // Soil Moisture Advisory
    const maEl = document.getElementById("moistureAdvisory");
    if (maEl && moistureAdvisory) {
        const lang = LangManager.current;
        const msg = lang === "hi" ? moistureAdvisory.msg_hi : moistureAdvisory.msg;
        const icons = { danger: "droplet-slash", warning: "droplet", success: "check-circle" };
        const icon = icons[moistureAdvisory.level] || "droplet";
        maEl.innerHTML = `<div class="moisture-alert moisture-${moistureAdvisory.level}"><i class="fa-solid fa-${icon}"></i> ${msg}</div>`;
        maEl.style.display = "block";
    } else if (maEl) {
        maEl.style.display = "none";
    }

    // TTS button — Rich Voice Advisor explanation
    const speakBtn = document.getElementById("speakResult");
    if (speakBtn) {
        speakBtn.onclick = () => {
            const voiceData = { predictions, moisture_advisory: moistureAdvisory, input_used: fullData?.input_used };
            const text = VoiceAdvisor.explainCrop(voiceData);
            VoiceAdvisor.speak(text, speakBtn);
        };
    }

    // WhatsApp share button
    const waBtn = document.getElementById("shareWhatsApp");
    if (waBtn) {
        waBtn.onclick = () => {
            const lines = predictions.slice(0, 3).map((p, i) => `${i + 1}. ${p.crop} — ${p.confidence}%`).join("\n");
            const msg = `🌾 *Kisan Salahkar — Crop Recommendation*\n\nBest crop: *${top.crop}* (${top.confidence}%)\n\n${lines}\n\n${top.tip ? "💡 " + top.tip : ""}\n\nDownload Kisan Salahkar app for smart farming advice!`;
            window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
        };
    }
}

// ================================================================
//  PREDICTION HISTORY
// ================================================================
async function loadPredictionHistory() {
    try {
        const data = await api("/api/predictions/history");
        if (data.success && data.history && data.history.length) {
            renderPredictionHistory(data.history);
        }
    } catch (_) { /* silently skip if not logged in */ }
}

function renderPredictionHistory(history) {
    const section = document.getElementById("historySection");
    const list = document.getElementById("historyList");
    if (!section || !list) return;
    section.style.display = "block";

    list.innerHTML = history.map(h => {
        const date = new Date(h.created_at).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
        const loc = [h.state, h.district].filter(Boolean).join(" › ") || "—";
        const seasonLabel = { kharif: "Kharif ☔", rabi: "Rabi ❄️", zaid: "Zaid ☀️" }[h.season] || "";
        return `
        <div class="history-card">
            <div class="history-top">
                <span class="history-crop"><i class="fa-solid fa-seedling"></i> ${h.top_crop}</span>
                <span class="history-conf">${h.confidence}%</span>
            </div>
            <div class="history-meta">
                <span><i class="fa-solid fa-map-marker-alt"></i> ${loc}</span>
                ${seasonLabel ? `<span class="season-badge season-${h.season}">${seasonLabel}</span>` : ""}
                <span class="history-date"><i class="fa-regular fa-clock"></i> ${date}</span>
            </div>
        </div>`;
    }).join("");
}

// ── Offline cached prediction helper ──
function getCachedPrediction() {
    try {
        const raw = localStorage.getItem("lastCropPrediction");
        if (!raw) return null;
        const data = JSON.parse(raw);
        // Cache valid for 7 days
        if (Date.now() - data.ts > 7 * 24 * 60 * 60 * 1000) return null;
        return data;
    } catch (_) { return null; }
}

// Load history on crop page
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("cropForm")) {
        loadPredictionHistory();
    }
});

// ================================================================
//  WEATHER
// ================================================================
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("weatherForm");
    if (!form) return;

    // Auto-fill city from user's saved location
    const cityInput = document.getElementById("cityInput");
    if (cityInput && window.USER_DEFAULTS?.location) {
        cityInput.value = window.USER_DEFAULTS.location;
        // Auto-fetch weather on page load with user's default location
        setTimeout(() => form.dispatchEvent(new Event("submit", {cancelable: true})), 300);
    }

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const city = document.getElementById("cityInput").value.trim();
        if (!city) return toast(t("enterCity"), "error");

        const btn = document.getElementById("weatherBtn");
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        document.getElementById("weatherLoading").style.display = "block";
        document.getElementById("weatherResult").style.display = "none";

        try {
            const data = await api(`/api/weather?city=${encodeURIComponent(city)}`);
            renderWeather(data);
            // Auto-speak weather explanation
            VoiceAdvisor.createSpeakButton("weatherResult", VoiceAdvisor.explainWeather, data);
        } catch (err) { toast(err.message, "error"); }
        finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> ${t("btnSearch")}`;
            document.getElementById("weatherLoading").style.display = "none";
        }
    });
});

function weatherIcon(desc) {
    const d = desc.toLowerCase();
    if (d.includes("sun") || d.includes("clear")) return "fa-sun";
    if (d.includes("cloud") && d.includes("part")) return "fa-cloud-sun";
    if (d.includes("cloud")) return "fa-cloud";
    if (d.includes("rain")) return "fa-cloud-rain";
    if (d.includes("thunder")) return "fa-bolt";
    if (d.includes("snow")) return "fa-snowflake";
    if (d.includes("fog") || d.includes("mist")) return "fa-smog";
    return "fa-cloud-sun";
}

function renderWeather(data) {
    const c = data.current;
    document.getElementById("weatherResult").style.display = "block";
    document.getElementById("weatherIcon").innerHTML = `<i class="fa-solid ${weatherIcon(c.desc)}"></i>`;
    document.getElementById("tempVal").textContent = `${c.temp}°C`;
    document.getElementById("weatherDesc").textContent = `${c.desc} — ${data.city}`;
    document.getElementById("feelsLike").textContent = `${c.feelsLike}°C`;
    document.getElementById("humidityVal").textContent = `${c.humidity}%`;
    document.getElementById("windVal").textContent = `${c.windSpeed} km/h ${c.windDir}`;
    document.getElementById("visVal").textContent = `${c.visibility} km`;
    document.getElementById("pressureVal").textContent = `${c.pressure} mb`;
    document.getElementById("uvVal").textContent = c.uv;

    // Advisory
    const advEl = document.getElementById("weatherAdvisory");
    if (advEl && data.advisory && data.advisory.length) {
        advEl.style.display = "block";
        advEl.innerHTML = data.advisory.map(a => `<div class="advisory-item"><i class="fa-solid fa-triangle-exclamation"></i> ${a}</div>`).join("");
    }

    const grid = document.getElementById("forecastGrid");
    grid.innerHTML = data.forecast.map(f => `
        <div class="forecast-card">
            <div class="fc-date">${f.date}</div>
            <div class="fc-icon"><i class="fa-solid ${weatherIcon(f.desc)}"></i></div>
            <div class="fc-temp">${f.minTemp}° — ${f.maxTemp}°C</div>
            <div class="fc-desc">${f.desc}</div>
            <div class="fc-hum"><i class="fa-solid fa-droplet"></i> ${f.humidity}%</div>
        </div>
    `).join("");

    document.getElementById("weatherResult").scrollIntoView({ behavior: "smooth" });
}

// ================================================================
//  MANDI PRICES (Feature 6) — Live from data.gov.in Agmarknet
//  Drill-down: State → District → Market → Crop
//  Features: Auto-location, Favorites, Price comparison
// ================================================================
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("mandiForm");
    if (!form) return;

    // ── Initialize ──
    loadMandiOverview();
    loadMandiFavorites();

    // ── State → District cascade ──
    const stateEl    = document.getElementById("mandiState");
    const districtEl = document.getElementById("mandiDistrict");
    const marketEl   = document.getElementById("mandiMarket");

    stateEl.addEventListener("change", async () => {
        const state = stateEl.value;
        // Reset dependent
        districtEl.innerHTML = `<option value="">${LangManager.t("mandiSelectDistrict") || "-- All Districts --"}</option>`;
        marketEl.innerHTML   = `<option value="">${LangManager.t("mandiSelectMarket") || "-- All Markets --"}</option>`;
        districtEl.disabled = true;
        marketEl.disabled   = true;
        if (!state) return;
        try {
            const d = await api(`/api/mandi/districts?state=${encodeURIComponent(state)}`);
            if (d.districts && d.districts.length) {
                districtEl.disabled = false;
                d.districts.forEach(dist => {
                    const opt = document.createElement("option");
                    opt.value = dist; opt.textContent = dist;
                    districtEl.appendChild(opt);
                });
            }
        } catch (e) { console.warn("Districts:", e); }
    });

    districtEl.addEventListener("change", async () => {
        const state = stateEl.value;
        const district = districtEl.value;
        marketEl.innerHTML = `<option value="">${LangManager.t("mandiSelectMarket") || "-- All Markets --"}</option>`;
        marketEl.disabled  = true;
        if (!district) return;
        try {
            const d = await api(`/api/mandi/markets?state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}`);
            if (d.markets && d.markets.length) {
                marketEl.disabled = false;
                d.markets.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m; opt.textContent = m;
                    marketEl.appendChild(opt);
                });
            }
        } catch (e) { console.warn("Markets:", e); }
    });

    // ── Search form submit ──
    form.addEventListener("submit", async e => {
        e.preventDefault();
        const crop     = document.getElementById("mandiCrop").value;
        const state    = stateEl.value;
        const district = districtEl.value;
        const market   = marketEl.value;
        if (!crop && !state) return toast(LangManager.t("mandiSelectHint") || "Select at least a state or crop", "error");
        document.getElementById("mandiLoading").style.display = "block";
        try {
            let url = "/api/mandi?";
            if (crop)     url += `crop=${encodeURIComponent(crop)}&`;
            if (state)    url += `state=${encodeURIComponent(state)}&`;
            if (district) url += `district=${encodeURIComponent(district)}&`;
            if (market)   url += `market=${encodeURIComponent(market)}&`;
            const data = await api(url);
            if (data.mandis) renderMandiDetail(data);
            else if (data.crops) renderMandiOverviewTable(data);
        } catch (err) { toast(err.message, "error"); }
        finally { document.getElementById("mandiLoading").style.display = "none"; }
    });

    // ── Clear button ──
    document.getElementById("mandiClearBtn")?.addEventListener("click", () => {
        stateEl.value = "";
        districtEl.innerHTML = `<option value="">${LangManager.t("mandiSelectDistrict") || "-- Select State First --"}</option>`;
        districtEl.disabled = true;
        marketEl.innerHTML  = `<option value="">${LangManager.t("mandiSelectMarket") || "-- Select District First --"}</option>`;
        marketEl.disabled = true;
        document.getElementById("mandiCrop").value = "";
        document.getElementById("mandiDetail").style.display = "none";
    });

    // ── Refresh button ──
    const refreshBtn = document.getElementById("mandiRefreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            refreshBtn.querySelector("i").classList.add("fa-spin");
            try {
                await api("/api/mandi/refresh");
                await loadMandiOverview();
                document.getElementById("mandiDetail").style.display = "none";
                toast(LangManager.t("mandiRefreshed") || "Prices refreshed from data.gov.in!", "success");
            } catch (e) { toast(e.message, "error"); }
            finally {
                refreshBtn.disabled = false;
                refreshBtn.querySelector("i").classList.remove("fa-spin");
            }
        });
    }

    // ── Detect location ──
    document.getElementById("mandiDetectBtn")?.addEventListener("click", async () => {
        const btn = document.getElementById("mandiDetectBtn");
        const statusEl = document.getElementById("mandiNearbyStatus");
        const resultsEl = document.getElementById("mandiNearbyResults");
        btn.disabled = true;
        btn.querySelector("i").className = "fa-solid fa-circle-notch fa-spin";
        statusEl.innerHTML = `<span class="text-muted"><i class="fa-solid fa-circle-notch fa-spin"></i> Detecting your location…</span>`;
        resultsEl.style.display = "none";
        try {
            const data = await api("/api/mandi/nearby");
            if (data.detected_state) {
                statusEl.innerHTML = `<i class="fa-solid fa-map-marker-alt" style="color:var(--primary);"></i> <strong>${data.detected_city || ""}</strong>, ${data.detected_state}`;

                // Auto-set the state dropdown
                stateEl.value = data.detected_state;
                stateEl.dispatchEvent(new Event("change"));

                if (data.records && data.records.length) {
                    resultsEl.style.display = "block";
                    // Group by commodity
                    const grouped = {};
                    data.records.forEach(r => {
                        const key = r.commodity || "Other";
                        if (!grouped[key]) grouped[key] = [];
                        grouped[key].push(r);
                    });
                    let html = '<div class="mandi-nearby-grid">';
                    for (const [commodity, items] of Object.entries(grouped).slice(0, 12)) {
                        const avg = Math.round(items.reduce((s, i) => s + (i.modal_price || 0), 0) / items.length);
                        html += `
                        <div class="mandi-nearby-item" onclick="mandiQuickSearch('${items[0].market || ""}','${data.detected_state}','${items[0].district || ""}')">
                            <div class="mandi-nearby-commodity">${commodity}</div>
                            <div class="mandi-nearby-price">₹${avg.toLocaleString("en-IN")}/qtl</div>
                            <div class="mandi-nearby-meta">${items[0].market || ""} · ${items.length} entries</div>
                        </div>`;
                    }
                    html += '</div>';
                    resultsEl.innerHTML = html;
                } else {
                    resultsEl.style.display = "block";
                    resultsEl.innerHTML = `<span class="text-muted">${LangManager.t("mandiNearbyNone") || "No price data found for your area today."}</span>`;
                }
            } else {
                statusEl.innerHTML = `<span class="text-muted">${LangManager.t("mandiNearbyFail") || "Could not detect location. Please select state manually."}</span>`;
            }
        } catch (e) {
            statusEl.innerHTML = `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Location detection failed</span>`;
        } finally {
            btn.disabled = false;
            btn.querySelector("i").className = "fa-solid fa-location-dot";
        }
    });
});

// Quick search from nearby/favorites
function mandiQuickSearch(market, state, district) {
    const stateEl = document.getElementById("mandiState");
    if (state && stateEl) {
        stateEl.value = state;
        stateEl.dispatchEvent(new Event("change"));
        setTimeout(() => {
            const distEl = document.getElementById("mandiDistrict");
            if (district && distEl) { distEl.value = district; distEl.dispatchEvent(new Event("change")); }
            setTimeout(() => {
                const mktEl = document.getElementById("mandiMarket");
                if (market && mktEl) {
                    // Try to select the market option
                    for (let opt of mktEl.options) {
                        if (opt.value === market) { mktEl.value = market; break; }
                    }
                }
                document.getElementById("mandiForm").dispatchEvent(new Event("submit"));
            }, 800);
        }, 800);
    }
}

// ── Load overview table + dropdowns ──
async function loadMandiOverview() {
    try {
        const data = await api("/api/mandi");
        const select = document.getElementById("mandiCrop");
        const stateSelect = document.getElementById("mandiState");
        if (!select) return;

        // Populate crop dropdown
        while (select.options.length > 1) select.remove(1);
        data.crops.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.crop; opt.textContent = c.crop;
            select.appendChild(opt);
        });

        // Populate state dropdown
        if (stateSelect && data.states) {
            while (stateSelect.options.length > 1) stateSelect.remove(1);
            data.states.forEach(s => {
                const opt = document.createElement("option");
                opt.value = s; opt.textContent = s;
                stateSelect.appendChild(opt);
            });
        }

        // Status badge
        const badge    = document.getElementById("mandiBadge");
        const fetchedEl = document.getElementById("mandiFetchedAt");
        if (badge) {
            if (data.live) {
                badge.innerHTML = `<i class="fa-solid fa-circle" style="color:#22c55e;font-size:.55rem;vertical-align:middle;"></i> Live — data.gov.in`;
                badge.style.borderColor = "#22c55e";
            } else {
                badge.innerHTML = `<i class="fa-solid fa-circle" style="color:#f59e0b;font-size:.55rem;vertical-align:middle;"></i> Offline — cached data`;
                badge.style.borderColor = "#f59e0b";
            }
        }
        if (fetchedEl && data.fetched_at && data.fetched_at !== "offline") {
            fetchedEl.textContent = `Updated: ${data.fetched_at}`;
        } else if (fetchedEl) {
            fetchedEl.textContent = "";
        }

        renderMandiOverviewTable(data);
    } catch (e) {
        console.error("loadMandiOverview:", e);
        const badge = document.getElementById("mandiBadge");
        if (badge) {
            badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> API error`;
            badge.style.borderColor = "#ef4444";
        }
    }
}

function renderMandiOverviewTable(data) {
    const tbody = document.getElementById("mandiTableBody");
    if (!tbody || !data.crops) return;

    // Voice Advisor button for mandi overview
    VoiceAdvisor.createSpeakButton("mandiAllCrops", VoiceAdvisor.explainMandiOverview, data);
    tbody.innerHTML = data.crops.map(c => {
        const diff = c.msp ? c.avg_price - c.msp : 0;
        const diffClass = diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "";
        const diffIcon  = diff > 0 ? "fa-arrow-up" : diff < 0 ? "fa-arrow-down" : "fa-minus";
        const diffText  = diff !== 0 ? `${diff > 0 ? "+" : ""}₹${diff.toLocaleString("en-IN")}` : "—";
        return `
        <tr onclick="document.getElementById('mandiCrop').value='${c.crop}'; document.getElementById('mandiForm').dispatchEvent(new Event('submit'));" style="cursor:pointer;" title="Click to see ${c.crop} prices">
            <td><strong>${c.crop}</strong></td>
            <td>${c.msp ? '₹' + c.msp.toLocaleString("en-IN") : '—'}</td>
            <td class="${diffClass}"><strong>₹${c.avg_price.toLocaleString("en-IN")}</strong></td>
            <td>${c.num_mandis}</td>
            <td class="${diffClass}"><i class="fa-solid ${diffIcon}" style="font-size:.7rem;"></i> ${diffText}</td>
        </tr>`;
    }).join("");
}

// ── Render crop detail ──
function renderMandiDetail(data) {
    const detailEl = document.getElementById("mandiDetail");
    detailEl.style.display = "block";

    // Voice Advisor button for mandi detail
    VoiceAdvisor.createSpeakButton("mandiDetail", VoiceAdvisor.explainMandi, data);

    // Stat cards
    document.getElementById("mandiMSP").textContent = data.msp ? `₹${data.msp.toLocaleString("en-IN")}` : "N/A";
    document.getElementById("mandiAvgPrice").textContent = data.avg_price ? `₹${data.avg_price.toLocaleString("en-IN")}` : "—";
    document.getElementById("mandiMinPrice").textContent = data.min_price ? `₹${data.min_price.toLocaleString("en-IN")}` : "—";
    document.getElementById("mandiMaxPrice").textContent = data.max_price ? `₹${data.max_price.toLocaleString("en-IN")}` : "—";

    // Header
    const title = data.crop ? `${data.crop} — Mandi Prices` : "All Commodity Prices";
    document.getElementById("mandiDetailTitle").textContent = title;

    const totalEl = document.getElementById("mandiTotalRecords");
    if (totalEl) {
        totalEl.innerHTML = data.live
            ? `<i class="fa-solid fa-signal"></i> ${data.total_records} records · Agmarknet`
            : `<i class="fa-solid fa-database"></i> Offline data`;
    }

    // Price cards
    document.getElementById("mandiPrices").innerHTML = data.mandis.map(m => {
        const price = m.price || m.modal_price || 0;
        const minMax = (m.min_price && m.max_price)
            ? `<div class="mandi-card-range">₹${m.min_price.toLocaleString("en-IN")} – ₹${m.max_price.toLocaleString("en-IN")}</div>`
            : "";
        const variety = m.variety ? `<span class="mandi-card-variety"><i class="fa-solid fa-seedling"></i> ${m.variety}</span>` : "";
        const district = m.district ? `${m.district}, ` : "";
        const marketName = m.name || m.market || "—";
        const mspDiff = data.msp && price ? price - data.msp : 0;
        const mspTag  = data.msp ? (mspDiff >= 0
            ? `<span class="mandi-tag mandi-tag-green">+₹${mspDiff.toLocaleString("en-IN")} above MSP</span>`
            : `<span class="mandi-tag mandi-tag-red">₹${Math.abs(mspDiff).toLocaleString("en-IN")} below MSP</span>`)
            : "";

        return `
        <div class="mandi-price-card">
            <div class="mandi-card-top">
                <div class="mandi-card-market"><i class="fa-solid fa-store"></i> ${marketName}</div>
                <button type="button" class="mandi-fav-btn" title="Save to favorites"
                    onclick="addMandiFavorite('${m.state||""}','${m.district||""}','${marketName.replace(/'/g,"\\'")}')">
                    <i class="fa-regular fa-star"></i>
                </button>
            </div>
            <div class="mandi-card-price">₹${price.toLocaleString("en-IN")}/<small>${data.unit}</small></div>
            ${minMax}
            ${mspTag}
            ${variety}
            <div class="mandi-card-location"><i class="fa-solid fa-map-pin"></i> ${district}${m.state||""}</div>
            <div class="mandi-card-date"><i class="fa-solid fa-calendar"></i> ${m.date}</div>
        </div>`;
    }).join("");

    detailEl.scrollIntoView({ behavior: "smooth" });
}

// ── Favorites ──
async function loadMandiFavorites() {
    const listEl = document.getElementById("mandiFavList");
    if (!listEl) return;
    try {
        const data = await api("/api/mandi/favorites");
        if (!data.favorites || !data.favorites.length) {
            listEl.innerHTML = `<span class="text-muted">${LangManager.t("mandiFavEmpty") || "No saved mandis yet. Search and star a mandi to save it."}</span>`;
            return;
        }
        listEl.innerHTML = data.favorites.map(f => `
            <div class="mandi-fav-item" onclick="mandiQuickSearch('${(f.market||"").replace(/'/g,"\\'")}','${f.state}','${f.district}')">
                <div class="mandi-fav-info">
                    <i class="fa-solid fa-star" style="color:#f59e0b;"></i>
                    <div>
                        <strong>${f.label || f.market}</strong>
                        <span class="text-muted">${f.district ? f.district +", " : ""}${f.state}</span>
                    </div>
                </div>
                <button class="mandi-fav-del" onclick="event.stopPropagation(); removeMandiFavorite(${f.id})" title="Remove">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `).join("");
    } catch (e) {
        // Not logged in or error — hide favorites
        if (listEl) listEl.innerHTML = `<span class="text-muted">${LangManager.t("mandiFavLogin") || "Login to save your favorite mandis"}</span>`;
    }
}

async function addMandiFavorite(state, district, market) {
    try {
        const res = await api("/api/mandi/favorites", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ state, district, market }),
        });
        toast(res.message || "Mandi saved!", "success");
        loadMandiFavorites();
    } catch (e) {
        toast(e.message || "Login to save favorites", "error");
    }
}

async function removeMandiFavorite(id) {
    try {
        await api(`/api/mandi/favorites/${id}`, { method: "DELETE" });
        toast(LangManager.t("mandiFavRemoved") || "Removed from favorites", "info");
        loadMandiFavorites();
    } catch (e) { toast(e.message, "error"); }
}

// ================================================================
//  DISEASE DETECTION (Feature 7)
// ================================================================
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("diseaseForm");
    if (!form) return;

    // Image preview
    const imgInput = document.getElementById("diseaseImage");
    if (imgInput) {
        imgInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.getElementById("previewImg").src = e.target.result;
                    document.getElementById("imagePreview").style.display = "block";
                };
                reader.readAsDataURL(file);
            }
        });
    }

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const btn = document.getElementById("diagnoseBtn");
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
        showLoading(LangManager.current === "hi" ? "रोग का विश्लेषण हो रहा है..." : "Analyzing disease...");

        try {
            // Build payload including base64 image if available
            const payload = {
                crop: document.getElementById("diseaseCrop").value,
                symptoms: document.getElementById("diseaseSymptoms").value,
            };

            // Include image as base64 if uploaded
            const previewImg = document.getElementById("previewImg");
            if (previewImg && previewImg.src && previewImg.src.startsWith("data:image")) {
                payload.image = previewImg.src;  // data:image/...;base64,xxxx
            }

            const data = await api("/api/disease/detect", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            renderDiseaseResults(data.diseases, data.model_used, data.cnn_available);
        } catch (err) { toast(err.message, "error"); }
        finally {
            hideLoading();
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-stethoscope"></i> Diagnose Disease';
        }
    });
});

function renderDiseaseResults(diseases, modelUsed, cnnAvailable) {
    const card = document.getElementById("diseaseResult");
    card.style.display = "block";
    const isHi = LangManager.current === "hi";

    // Model badge
    const modelBadge = modelUsed === "cnn"
        ? `<div class="cnn-badge"><i class="fa-solid fa-brain"></i> ${isHi ? "CNN AI मॉडल द्वारा विश्लेषित" : "Analyzed by CNN AI Model"} <span class="cnn-badge-acc">95%+ accuracy</span></div>`
        : cnnAvailable === false
            ? `<div class="cnn-badge cnn-badge-text"><i class="fa-solid fa-font"></i> ${isHi ? "टेक्स्ट-आधारित विश्लेषण (CNN प्रशिक्षित नहीं)" : "Text-based analysis (CNN not trained yet)"}</div>`
            : `<div class="cnn-badge cnn-badge-text"><i class="fa-solid fa-font"></i> ${isHi ? "टेक्स्ट-आधारित विश्लेषण — बेहतर परिणाम के लिए फोटो अपलोड करें" : "Text-based analysis — upload a photo for CNN detection"}</div>`;

    document.getElementById("diseaseResults").innerHTML = modelBadge + diseases.map(d => {
        const isHealthy = d.is_healthy;
        const severityClass = isHealthy ? "healthy" : `severity-${d.severity}`;
        const confColor = d.confidence > 80 ? "#22c55e" : d.confidence > 50 ? "#f59e0b" : "#ef4444";
        const sourceIcon = d.source === "cnn" ? "🔬" : "📝";

        return `
        <div class="disease-card ${severityClass}">
            <div class="disease-header">
                <h3>${isHealthy ? '<i class="fa-solid fa-circle-check" style="color:#22c55e"></i>' : '<i class="fa-solid fa-virus"></i>'} ${isHi && d.disease_hi ? d.disease_hi : d.disease}</h3>
                <div class="disease-badges">
                    ${isHealthy
                        ? `<span class="severity-badge severity-healthy">${isHi ? "स्वस्थ" : "HEALTHY"}</span>`
                        : `<span class="severity-badge severity-${d.severity}">${d.severity.toUpperCase()}</span>`}
                    <span class="confidence-badge" style="background:${confColor}20; color:${confColor}; border:1px solid ${confColor}40;">
                        ${sourceIcon} ${d.confidence}%
                    </span>
                </div>
            </div>
            <div class="disease-meta">
                <span class="disease-crop"><i class="fa-solid fa-leaf"></i> ${d.crop}</span>
                <span><i class="fa-solid fa-tag"></i> ${d.type}</span>
            </div>
            ${isHealthy ? `
                <div class="disease-section healthy-msg">
                    <p><i class="fa-solid fa-circle-check"></i> ${isHi
                        ? "यह पत्ती स्वस्थ दिखती है! कोई बीमारी नहीं पाई गई।"
                        : "This leaf looks healthy! No disease detected."}</p>
                </div>
            ` : `
                ${d.symptoms ? `
                <div class="disease-section">
                    <h4><i class="fa-solid fa-eye"></i> ${isHi ? "लक्षण" : "Symptoms"}</h4>
                    <p>${isHi && d.symptoms_hi ? d.symptoms_hi : d.symptoms}</p>
                </div>` : ""}
                <div class="disease-section treatment">
                    <h4><i class="fa-solid fa-prescription-bottle-medical"></i> ${isHi ? "उपचार" : "Treatment"}</h4>
                    <p>${isHi && d.treatment_hi ? d.treatment_hi : d.treatment}</p>
                </div>
            `}
        </div>`;
    }).join("");

    // TTS — Rich Voice Advisor explanation
    const speakBtn = document.getElementById("speakDiagnosis");
    if (speakBtn && diseases.length) {
        speakBtn.onclick = () => {
            const voiceData = { diseases, model_used: modelUsed, cnn_available: cnnAvailable };
            const text = VoiceAdvisor.explainDisease(voiceData);
            VoiceAdvisor.speak(text, speakBtn);
        };
    }

    card.scrollIntoView({ behavior: "smooth" });
}

// ================================================================
//  GOVERNMENT SCHEMES (Feature 5)
// ================================================================
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("schemeForm");
    if (!form) return;

    // Load all schemes
    loadAllSchemes();

    form.addEventListener("submit", async e => {
        e.preventDefault();
        try {
            const data = await api("/api/schemes/check", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    land_ha: document.getElementById("schemeLand").value,
                    category: document.getElementById("schemeCategory").value,
                    state: document.getElementById("schemeState").value,
                }),
            });
            renderSchemeResults(data);
        } catch (err) { toast(err.message, "error"); }
    });
});

async function loadAllSchemes() {
    try {
        const data = await api("/api/schemes");
        const grid = document.getElementById("allSchemes");
        if (!grid) return;
        const isHi = LangManager.current === "hi";
        grid.innerHTML = data.schemes.map(s => `
            <div class="info-block">
                <div class="info-header">
                    <i class="fa-solid fa-landmark"></i>
                    <h3>${isHi ? s.name_hi : s.name}</h3>
                </div>
                <div class="info-body">
                    <p>${isHi ? s.desc_hi : s.desc}</p>
                    <p style="margin-top:.5rem;"><strong>Benefits:</strong> ${s.benefits}</p>
                    <a href="${s.url}" target="_blank" class="btn btn-primary" style="margin-top:.75rem;font-size:.85rem;">
                        <i class="fa-solid fa-external-link-alt"></i> Apply Online
                    </a>
                </div>
            </div>
        `).join("");
    } catch (e) { console.error(e); }
}

function renderSchemeResults(data) {
    document.getElementById("schemeResult").style.display = "block";
    const isHi = LangManager.current === "hi";
    document.getElementById("schemeCount").innerHTML = `
        <div class="crop-name"><i class="fa-solid fa-check-circle" style="color:#27ae60"></i> ${data.total} ${isHi ? "योजनाएँ उपलब्ध" : "Schemes Available"}</div>
    `;

    // Voice Advisor button for schemes
    VoiceAdvisor.createSpeakButton("schemeResult", VoiceAdvisor.explainSchemes, data);

    document.getElementById("schemeList").innerHTML = data.eligible.map(s => `
        <div class="scheme-item">
            <h3><i class="fa-solid fa-landmark"></i> ${isHi ? s.name_hi : s.name}</h3>
            <p>${isHi ? s.desc_hi : s.desc}</p>
            <p class="scheme-benefit"><i class="fa-solid fa-gift"></i> ${s.benefits}</p>
            <a href="${s.url}" target="_blank" class="btn btn-primary" style="font-size:.85rem;">
                <i class="fa-solid fa-external-link-alt"></i> ${isHi ? "ऑनलाइन आवेदन" : "Apply Online"}
            </a>
        </div>
    `).join("");

    document.getElementById("schemeResult").scrollIntoView({ behavior: "smooth" });
}

// ================================================================
//  SOIL TESTING (Feature 2)
// ================================================================
document.addEventListener("DOMContentLoaded", () => {
    const lookupForm = document.getElementById("soilLookupForm");
    const soilForm = document.getElementById("soilForm");
    if (!lookupForm && !soilForm) return;

    if (lookupForm) {
        lookupForm.addEventListener("submit", async e => {
            e.preventDefault();
            const id = document.getElementById("reportId").value.trim();
            if (!id) return toast("Enter a report ID", "error");
            try {
                const data = await api("/api/soil/submit", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ report_id: id }),
                });
                renderSoilReport(data);
            } catch (err) { toast(err.message, "error"); }
        });
    }

    if (soilForm) {
        soilForm.addEventListener("submit", async e => {
            e.preventDefault();
            try {
                const data = await api("/api/soil/submit", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        N: document.getElementById("soilN").value,
                        P: document.getElementById("soilP").value,
                        K: document.getElementById("soilK").value,
                        pH: document.getElementById("soilPH").value,
                        EC: document.getElementById("soilEC")?.value || 0,
                        OC: document.getElementById("soilOC")?.value || 0,
                        S: document.getElementById("soilS")?.value || 0,
                        Zn: document.getElementById("soilZn")?.value || 0,
                        soil_type: document.getElementById("soilType")?.value || "",
                        location: document.getElementById("soilLocation")?.value || "",
                    }),
                });
                renderSoilReport(data);
                toast("Soil analysis complete!", "success");
            } catch (err) { toast(err.message, "error"); }
        });
    }
});

function renderSoilReport(data) {
    document.getElementById("soilResult").style.display = "block";
    document.getElementById("soilReportId").innerHTML = `
        <div class="soil-id"><i class="fa-solid fa-file-lines"></i> Report: <strong>${data.report_id || "N/A"}</strong></div>
    `;

    // Voice Advisor button for soil report
    VoiceAdvisor.createSpeakButton("soilResult", VoiceAdvisor.explainSoil, data);

    if (data.recommendations) {
        document.getElementById("soilRecommendations").innerHTML = data.recommendations.map(r => `
            <div class="soil-rec status-${r.status.toLowerCase()}">
                <div class="soil-rec-header">
                    <span class="soil-nutrient">${r.nutrient}</span>
                    <span class="soil-status status-${r.status.toLowerCase()}">${r.status}</span>
                </div>
                <p class="soil-action"><i class="fa-solid fa-arrow-right"></i> ${r.action}</p>
            </div>
        `).join("");
    }

    document.getElementById("soilResult").scrollIntoView({ behavior: "smooth" });
}

// ================================================================
//  COMMUNITY FORUM (Feature 10)
// ================================================================
document.addEventListener("DOMContentLoaded", () => {
    const postForm = document.getElementById("forumPostForm");
    if (!postForm) return;

    loadForumPosts();

    postForm.addEventListener("submit", async e => {
        e.preventDefault();
        try {
            await api("/api/forum/post", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: document.getElementById("postTitle").value.trim(),
                    content: document.getElementById("postContent").value.trim(),
                    category: document.getElementById("postCategory").value,
                }),
            });
            toast("Post created!", "success");
            document.getElementById("postTitle").value = "";
            document.getElementById("postContent").value = "";
            loadForumPosts();
        } catch (err) { toast(err.message, "error"); }
    });

    // Category filters
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            loadForumPosts(btn.dataset.cat);
        });
    });

    // Reply form
    const replyForm = document.getElementById("replyForm");
    if (replyForm) {
        replyForm.addEventListener("submit", async e => {
            e.preventDefault();
            try {
                const data = await api("/api/forum/reply", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        post_id: document.getElementById("replyPostId").value,
                        content: document.getElementById("replyContent").value.trim(),
                    }),
                });
                document.getElementById("replyContent").value = "";
                renderReplies(data.replies);
                toast("Reply sent!", "success");
            } catch (err) { toast(err.message, "error"); }
        });
    }
});

async function loadForumPosts(category = "") {
    try {
        const url = category ? `/api/forum/posts?category=${category}` : "/api/forum/posts";
        const data = await api(url);
        const container = document.getElementById("forumPosts");
        if (!container) return;

        if (!data.posts.length) {
            container.innerHTML = '<div class="no-posts"><i class="fa-solid fa-comments"></i><p>No posts yet. Be the first to ask!</p></div>';
            return;
        }

        const catIcons = { general: "💬", crop: "🌾", pest: "🐛", market: "💰", govt: "🏛️", equipment: "🔧" };
        container.innerHTML = data.posts.map(p => `
            <div class="forum-post">
                <div class="post-header">
                    <span class="post-cat">${catIcons[p.category] || "💬"} ${p.category}</span>
                    <span class="post-time">${new Date(p.created_at).toLocaleDateString("en-IN")}</span>
                </div>
                <h3 class="post-title">${p.title}</h3>
                <p class="post-content">${p.content.substring(0, 200)}${p.content.length > 200 ? "..." : ""}</p>
                <div class="post-footer">
                    <span class="post-author"><i class="fa-solid fa-user"></i> ${p.username}</span>
                    <div class="post-actions">
                        <button onclick="likePost(${p.id})" class="post-action-btn"><i class="fa-solid fa-heart"></i> ${p.likes}</button>
                        <button onclick="openReplyModal(${p.id}, '${p.title.replace(/'/g, "\\'")}', '${p.content.replace(/'/g, "\\'").substring(0, 100)}')" class="post-action-btn"><i class="fa-solid fa-reply"></i> ${p.replies}</button>
                    </div>
                </div>
            </div>
        `).join("");
    } catch (e) { console.error(e); }
}

async function likePost(id) {
    try {
        await api("/api/forum/like", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ post_id: id }),
        });
        loadForumPosts();
    } catch (e) { toast(e.message, "error"); }
}

function openReplyModal(postId, title, content) {
    document.getElementById("replyPostId").value = postId;
    document.getElementById("replyPostContent").innerHTML = `<h4>${title}</h4><p>${content}</p>`;
    document.getElementById("repliesList").innerHTML = '<div class="loading-box"><div class="spinner"></div></div>';
    document.getElementById("replyModal").style.display = "flex";
    // Load existing replies
    api(`/api/forum/posts`).then(data => {
        // Find replies in a separate call if needed
    }).catch(() => {});
}

function closeReplyModal() {
    document.getElementById("replyModal").style.display = "none";
}

function renderReplies(replies) {
    document.getElementById("repliesList").innerHTML = replies.map(r => `
        <div class="reply-item">
            <div class="reply-author"><i class="fa-solid fa-user"></i> ${r.username} • ${new Date(r.created_at).toLocaleDateString("en-IN")}</div>
            <p>${r.content}</p>
        </div>
    `).join("");
}

// ================================================================
//  SMS ALERTS (Feature 3)
// ================================================================
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("alertForm");
    if (!form) return;

    loadAlertStatus();

    form.addEventListener("submit", async e => {
        e.preventDefault();
        try {
            const data = await api("/api/alerts/subscribe", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: document.getElementById("alertPhone").value.trim(),
                    alert_type: document.getElementById("alertType").value,
                    city: document.getElementById("alertCity").value.trim(),
                }),
            });
            toast(data.message, "success");
            loadAlertStatus();
        } catch (err) { toast(err.message, "error"); }
    });
});

async function loadAlertStatus() {
    try {
        const data = await api("/api/alerts/status");
        const container = document.getElementById("activeAlerts");
        if (!container) return;

        if (!data.subscriptions || !data.subscriptions.length) {
            container.innerHTML = '<p class="no-posts">No active subscriptions. Subscribe above to get alerts!</p>';
            return;
        }

        const typeLabels = { all: "All Alerts", weather: "Weather", pest: "Pest Warnings", market: "Market", scheme: "Schemes" };
        container.innerHTML = data.subscriptions.map(s => `
            <div class="alert-item">
                <div class="alert-item-info">
                    <i class="fa-solid fa-bell"></i>
                    <div>
                        <strong>${typeLabels[s.alert_type] || s.alert_type}</strong>
                        <p>📱 +91-${s.phone} • 📍 ${s.city}</p>
                    </div>
                </div>
                <button onclick="unsubscribeAlert(${s.id})" class="btn btn-danger-sm"><i class="fa-solid fa-times"></i></button>
            </div>
        `).join("");
    } catch (e) { console.error(e); }
}

async function unsubscribeAlert(id) {
    try {
        await api("/api/alerts/unsubscribe", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        toast("Unsubscribed", "success");
        loadAlertStatus();
    } catch (e) { toast(e.message, "error"); }
}


/* ═══════════════════════════════════════════════════════════════
   IoT SENSOR DASHBOARD
   ═══════════════════════════════════════════════════════════════ */

let sensorHistoryChart = null;
let sensorPollTimer = null;

// ─── Initialise IoT page when detected ───
function initIoTDashboard() {
    if (!document.getElementById("valTemp")) return;
    refreshSensorData();
    loadHistory(6);
    // Auto-refresh every 30 seconds
    sensorPollTimer = setInterval(refreshSensorData, 30000);
}

// ─── Fetch latest sensor reading ───
async function refreshSensorData() {
    try {
        const res = await fetch("/api/sensor/latest");
        const data = await res.json();

        if (!data.success) {
            showNoSensorData();
            return;
        }

        const r = data.reading;
        hideSetupGuide();

        // Handle disconnected sensors (Flask sends moisture_connected / ph_connected / ph_in_air flags)
        const moistureOk = r.moisture_connected !== false;
        const phOk = r.ph_connected !== false;
        const phInAir = r.ph_in_air === true;

        // Update gauge values
        animateValue("valTemp", r.temperature, 1, "°C");
        animateValue("valHumidity", r.humidity, 0, "%");
        if (moistureOk) {
            animateValue("valMoisture", r.moisture, 0, "%");
        } else {
            const el = document.getElementById("valMoisture");
            if (el) el.textContent = "N/C";
        }
        if (phOk) {
            animateValue("valPH", r.ph, 1, "");
        } else {
            const el = document.getElementById("valPH");
            if (el) el.textContent = phInAir ? "AIR" : "N/C";
        }

        // Update gauge bars (percentage of max)
        setBarWidth("barTemp", r.temperature, 50);       // max 50°C
        setBarWidth("barHumidity", r.humidity, 100);
        setBarWidth("barMoisture", moistureOk ? r.moisture : 0, 100);
        setBarWidth("barPH", phOk ? r.ph : 0, 14);       // pH 0-14

        // Colour-code gauge cards based on severity
        colourGauge("gaugeTemp", r.temperature, [
            [5, "danger"], [10, "warning"], [38, "success"], [42, "warning"], [99, "danger"]
        ]);
        if (moistureOk) {
            colourGauge("gaugeMoisture", r.moisture, [
                [25, "danger"], [40, "warning"], [80, "success"], [85, "warning"], [100, "danger"]
            ]);
        } else {
            // Grey out disconnected sensor
            const mc = document.getElementById("gaugeMoisture");
            if (mc) { mc.classList.remove("gauge-success","gauge-warning","gauge-danger"); mc.classList.add("gauge-warning"); }
        }
        if (phOk) {
            colourGauge("gaugePH", r.ph, [
                [4.5, "danger"], [5.5, "warning"], [8.0, "success"], [8.5, "warning"], [14, "danger"]
            ]);
        } else {
            const pc = document.getElementById("gaugePH");
            if (pc) { pc.classList.remove("gauge-success","gauge-warning","gauge-danger"); pc.classList.add("gauge-warning"); }
        }
        colourGauge("gaugeHumidity", r.humidity, [
            [20, "warning"], [85, "success"], [100, "warning"]
        ]);

        // Show raw debug info (ADC values) as subtitles under moisture & pH cards
        const moistureCard = document.getElementById("gaugeMoisture");
        if (moistureCard) {
            let rawEl = moistureCard.querySelector(".iot-raw-debug");
            if (!rawEl) { rawEl = document.createElement("small"); rawEl.className = "iot-raw-debug"; moistureCard.querySelector(".iot-gauge-body").appendChild(rawEl); }
            rawEl.textContent = `Raw ADC: ${r.moisture_raw ?? '--'}` + (!moistureOk ? ' (disconnected)' : '');
        }
        const phCard = document.getElementById("gaugePH");
        if (phCard) {
            let rawEl = phCard.querySelector(".iot-raw-debug");
            if (!rawEl) { rawEl = document.createElement("small"); rawEl.className = "iot-raw-debug"; phCard.querySelector(".iot-gauge-body").appendChild(rawEl); }
            rawEl.textContent = `Raw ADC: ${r.ph_raw ?? '--'} | ${(r.ph_voltage ?? 0).toFixed(3)}V` + (!phOk ? ' (disconnected)' : '');
        }

        // ── Check if ESP32 is still actively sending data ──
        const deviceOnline = r.device_online !== false;
        const ageSec = r.data_age_seconds || 0;

        // Update status bar — show per-sensor health OR offline
        if (!deviceOnline) {
            // ESP32 is off / disconnected from WiFi — data is stale
            updateDeviceStatus("offline", r.device_id, null, ageSec);
        } else {
            const dhtOk = (r.temperature !== -999 && r.humidity !== -999);
            const sensorsDown = [!dhtOk && "DHT11", !moistureOk && "Moisture", !phOk && "pH"].filter(Boolean);
            if (sensorsDown.length === 0) {
                updateDeviceStatus("online", r.device_id);
            } else {
                updateDeviceStatus("online", r.device_id, sensorsDown);
            }
        }
        const el = document.getElementById("lastUpdateTime");
        if (el) {
            const timeStr = new Date(r.created_at).toLocaleTimeString();
            if (!deviceOnline) {
                const agoText = formatTimeAgo(ageSec);
                el.innerHTML = `<i class="fa-regular fa-clock"></i> Last seen: ${agoText} (${timeStr})`;
            } else {
                el.innerHTML = `<i class="fa-regular fa-clock"></i> ${timeStr}`;
            }
        }
        const wifi = document.getElementById("wifiSignal");
        if (wifi) {
            if (!deviceOnline) {
                wifi.innerHTML = `<i class="fa-solid fa-wifi" style="opacity:0.4"></i> --`;
            } else {
                wifi.innerHTML = `<i class="fa-solid fa-wifi"></i> ${r.wifi_rssi || '--'} dBm`;
            }
        }
        const bat = document.getElementById("batteryLevel");
        if (bat && r.battery_v) {
            const pct = Math.min(100, Math.max(0, ((r.battery_v - 6.0) / (8.4 - 6.0)) * 100));
            const icon = pct > 75 ? "full" : pct > 50 ? "three-quarters" : pct > 25 ? "half" : pct > 10 ? "quarter" : "empty";
            bat.innerHTML = `<i class="fa-solid fa-battery-${icon}"></i> ${r.battery_v.toFixed(1)}V`;
        }

        // Render advisories
        renderAdvisories(r.advisories || []);

        // Voice Advisor button for IoT dashboard
        VoiceAdvisor.createSpeakButton("iotAdvisories", VoiceAdvisor.explainIoT, r);

        // Update mini-widget on dashboard if present
        updateDashboardWidget(r);

    } catch (e) {
        console.error("Sensor fetch error:", e);
        updateDeviceStatus("offline");
    }
}

function showNoSensorData() {
    const guide = document.getElementById("iotSetupGuide");
    if (guide) guide.style.display = "block";
    updateDeviceStatus("offline");
}

function hideSetupGuide() {
    const guide = document.getElementById("iotSetupGuide");
    if (guide) guide.style.display = "none";
}

function animateValue(elementId, value, decimals, suffix) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const formatted = (typeof value === "number") ? value.toFixed(decimals) : "--";
    el.textContent = formatted;
}

function setBarWidth(barId, value, max) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    bar.style.width = pct + "%";
}

function colourGauge(cardId, value, thresholds) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.classList.remove("gauge-success", "gauge-warning", "gauge-danger");
    for (const [limit, level] of thresholds) {
        if (value <= limit) {
            card.classList.add("gauge-" + level);
            return;
        }
    }
}

function formatTimeAgo(seconds) {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function updateDeviceStatus(status, deviceId, sensorsDown, ageSec) {
    const chip = document.getElementById("deviceStatusChip");
    const text = document.getElementById("deviceStatusText");
    const pulse = document.getElementById("iotPulse");
    if (!chip) return;

    chip.classList.remove("status-online", "status-offline", "status-connecting");

    if (text) {
        const lang = localStorage.getItem("lang") || "en";
        if (status === "offline" && ageSec != null) {
            // ESP32 powered off or disconnected from WiFi — stale data
            chip.classList.add("status-offline");
            const ago = formatTimeAgo(ageSec);
            text.textContent = lang === "hi"
                ? `ऑफ़लाइन — आखिरी डेटा ${ago} पहले`
                : `Offline — last data ${ago}`;
        } else if (status === "online" && sensorsDown && sensorsDown.length > 0) {
            // ESP32 online but some sensors disconnected
            chip.classList.add("status-online");
            const sensorList = sensorsDown.join(", ");
            text.textContent = lang === "hi"
                ? `ऑनलाइन — ${sensorsDown.length} सेंसर डिस्कनेक्ट (${sensorList})`
                : `Online — ${sensorsDown.length} sensor${sensorsDown.length > 1 ? 's' : ''} disconnected (${sensorList})`;
        } else {
            chip.classList.add("status-" + status);
            const labels = {
                online:  lang === "hi" ? "ऑनलाइन — सभी सेंसर कनेक्ट" : "Online — All sensors connected",
                offline: lang === "hi" ? "ऑफ़लाइन — ESP32 कनेक्ट करें" : "Offline — Connect ESP32",
                connecting: lang === "hi" ? "कनेक्ट हो रहा है..." : "Connecting...",
            };
            text.textContent = labels[status] || status;
        }
    }
    if (pulse) pulse.className = "iot-pulse " + (status === "online" ? "pulse-active" : "");
}

function renderAdvisories(advisories) {
    const container = document.getElementById("advisoryList");
    const section = document.getElementById("iotAdvisories");
    if (!container || !section) return;

    if (!advisories.length) { section.style.display = "none"; return; }
    section.style.display = "block";

    const lang = localStorage.getItem("lang") || "en";
    container.innerHTML = advisories.map(a => `
        <div class="iot-advisory iot-advisory-${a.type}">
            <i class="fa-solid fa-${a.icon}"></i>
            <span>${lang === "hi" && a.msg_hi ? a.msg_hi : a.msg}</span>
        </div>
    `).join("");
}

// ─── Sensor history chart ───
async function loadHistory(hours, btn) {
    // Toggle active button
    if (btn) {
        document.querySelectorAll(".iot-chart-controls .btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
    }

    try {
        const res = await fetch(`/api/sensor/history?hours=${hours}`);
        const data = await res.json();

        const chartEl = document.getElementById("sensorHistoryChart");
        const emptyEl = document.getElementById("chartEmpty");
        if (!chartEl) return;

        if (!data.success || !data.history.length) {
            chartEl.style.display = "none";
            if (emptyEl) emptyEl.style.display = "block";
            return;
        }
        chartEl.style.display = "block";
        if (emptyEl) emptyEl.style.display = "none";

        const labels = data.history.map(h => {
            const d = new Date(h.created_at);
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        });

        const datasets = [
            { label: "Temperature (°C)", data: data.history.map(h => h.temperature), borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.1)", tension: 0.3, fill: true },
            { label: "Humidity (%)", data: data.history.map(h => h.humidity), borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)", tension: 0.3, fill: true },
            { label: "Soil Moisture (%)", data: data.history.map(h => h.moisture), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", tension: 0.3, fill: true },
            { label: "pH", data: data.history.map(h => h.ph), borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)", tension: 0.3, fill: true },
        ];

        if (sensorHistoryChart) sensorHistoryChart.destroy();

        sensorHistoryChart = new Chart(chartEl, {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { position: "top", labels: { usePointStyle: true, padding: 15 } },
                    tooltip: { mode: "index", intersect: false },
                },
                scales: {
                    x: { display: true, grid: { display: false } },
                    y: { display: true, grid: { color: "rgba(0,0,0,0.05)" } },
                }
            }
        });

    } catch (e) {
        console.error("History load error:", e);
    }
}

// ─── Show AI Source Explanation Banner ───
function showAISourceBanner(sensorData) {
    const banner = document.getElementById("aiSourceBanner");
    const detail = document.getElementById("aiSourceDetail");
    if (!banner || !detail) return;

    const sources = [];
    sources.push(`<b>Temperature</b> (${sensorData.temperature}°C), <b>Humidity</b> (${sensorData.humidity}%), <b>pH</b> (${sensorData.ph}), <b>Moisture</b> (${sensorData.moisture}%) — read from your <em>ESP32 sensors</em>`);
    if (sensorData.npk_source === "ai") {
        sources.push(`<b>N</b> (${Math.round(sensorData.N)}), <b>P</b> (${Math.round(sensorData.P)}), <b>K</b> (${Math.round(sensorData.K)}) — <em>AI-predicted</em> by KNN model trained on 20,000+ soil samples`);
    }
    detail.innerHTML = sources.join("<br>");
    banner.style.display = "block";
    banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ─── Auto-fill rainfall from state + season ───
async function autoFillRainfall() {
    const state = document.getElementById("stateSelect")?.value;
    const season = document.getElementById("seasonSelect")?.value;
    const district = document.getElementById("districtSelect")?.value;
    const rainfallInput = document.getElementById("rainfall");
    if (!state || !rainfallInput) return;

    try {
        const params = new URLSearchParams({ state });
        if (season) params.set("season", season);
        if (district) params.set("district", district);

        const data = await api(`/api/rainfall/estimate?${params.toString()}`);
        if (data.rainfall != null) {
            rainfallInput.value = data.rainfall;
            rainfallInput.style.borderColor = "var(--primary, #27ae60)";

            // Add/update rainfall badge
            const parent = rainfallInput.parentElement;
            let badge = parent.querySelector(".rainfall-badge");
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "ai-badge rainfall-badge";
                parent.appendChild(badge);
            }
            const sourceLabel = data.source === "historical+live" ? "Live + Historical" : "Historical Avg";
            badge.innerHTML = `<i class="fa-solid fa-cloud-rain"></i> ${sourceLabel}`;

            const seasonLabel = season ? season.charAt(0).toUpperCase() + season.slice(1) : "Auto";
            toast(`🌧️ Rainfall estimated: ${data.rainfall} mm/season (${data.state}, ${seasonLabel})`, "success");
        }
    } catch (_) {
        // Silently fail — user can still enter manually
    }
}

// ─── Auto-fill crop form from sensors ───
async function autoFillFromSensors() {
    try {
        const res = await fetch("/api/sensor/autofill");
        const data = await res.json();

        if (!data.success) {
            toast(data.error || "No sensor data available", "error");
            return;
        }

        const a = data.autofill;

        // If we're on the crop page, fill directly
        const phInput = document.getElementById("ph");
        const tempInput = document.getElementById("temperature");
        const humInput = document.getElementById("humidity");
        const moistInput = document.getElementById("soilMoisture");

        if (phInput) phInput.value = a.ph;
        if (tempInput) tempInput.value = a.temperature;
        if (humInput) humInput.value = a.humidity;
        if (moistInput && a.moisture != null) moistInput.value = a.moisture;

        // Fill NPK from AI model prediction
        const nInput = document.getElementById("nitrogen");
        const pInput = document.getElementById("phosphorus");
        const kInput = document.getElementById("potassium");
        if (a.npk_source === "ai" && a.N != null) {
            if (nInput) nInput.value = Math.round(a.N);
            if (pInput) pInput.value = Math.round(a.P);
            if (kInput) kInput.value = Math.round(a.K);
            toast("✅ Sensor data filled! N/P/K predicted by AI model (Temp, Humidity, pH, Moisture → NPK)", "success");
        } else {
            toast("✅ Sensor data filled! Add N/P/K and rainfall manually.", "success");
        }

        // Show AI badge on NPK fields if available
        if (a.npk_source === "ai") {
            [nInput, pInput, kInput].forEach(el => {
                if (!el) return;
                el.style.borderColor = "var(--primary, #27ae60)";
                el.classList.add("ai-filled");
                const badge = el.parentElement.querySelector(".ai-badge");
                if (!badge) {
                    const span = document.createElement("span");
                    span.className = "ai-badge";
                    span.innerHTML = '<i class="fa-solid fa-robot"></i> AI Predicted';
                    el.parentElement.appendChild(span);
                }
            });
            // Also highlight sensor-filled fields
            [phInput, tempInput, humInput, moistInput].forEach(el => {
                if (!el) return;
                el.classList.add("sensor-filled");
                const badge = el.parentElement.querySelector(".sensor-badge");
                if (!badge) {
                    const span = document.createElement("span");
                    span.className = "ai-badge sensor-badge";
                    span.innerHTML = '<i class="fa-solid fa-microchip"></i> ESP32 Sensor';
                    el.parentElement.appendChild(span);
                }
            });
            // Show AI explanation banner
            showAISourceBanner(a);
        }

        // If on IoT page, redirect to crop page with params
        if (!phInput) {
            const params = new URLSearchParams({
                ph: a.ph,
                temperature: a.temperature,
                humidity: a.humidity,
                soilMoisture: a.moisture,
                from: "iot"
            });
            if (a.npk_source === "ai") {
                params.set("N", Math.round(a.N));
                params.set("P", Math.round(a.P));
                params.set("K", Math.round(a.K));
                params.set("npk_source", "ai");
            }
            window.location.href = "/crop?" + params.toString();
        }
    } catch (e) {
        toast("Cannot fetch sensor data. Is ESP32 connected?", "error");
    }
}

// ─── Dashboard mini-widget update ───
function updateDashboardWidget(r) {
    const widget = document.getElementById("sensorMiniWidget");
    if (!widget || !r) return;
    widget.style.display = "flex";
    document.getElementById("miniTemp").textContent = r.temperature.toFixed(1) + "°C";
    document.getElementById("miniHumidity").textContent = r.humidity.toFixed(0) + "%";
    document.getElementById("miniMoisture").textContent = r.moisture.toFixed(0) + "%";
    document.getElementById("miniPH").textContent = r.ph.toFixed(1);
}

// ─── Crop page: auto-fill from URL params (coming from IoT page) ───
function autoFillFromURLParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "iot") return;

    const fields = { ph: "ph", temperature: "temperature", humidity: "humidity", soilMoisture: "soilMoisture" };
    for (const [param, inputId] of Object.entries(fields)) {
        const val = params.get(param);
        const input = document.getElementById(inputId);
        if (val && input) input.value = val;
    }

    // Fill AI-predicted NPK if available
    if (params.get("npk_source") === "ai") {
        const npkFields = { N: "nitrogen", P: "phosphorus", K: "potassium" };
        for (const [param, inputId] of Object.entries(npkFields)) {
            const val = params.get(param);
            const input = document.getElementById(inputId);
            if (val && input) {
                input.value = Math.round(Number(val));
                input.style.borderColor = "var(--primary, #27ae60)";
                input.classList.add("ai-filled");
                if (!input.parentElement.querySelector(".ai-badge")) {
                    const span = document.createElement("span");
                    span.className = "ai-badge";
                    span.innerHTML = '<i class="fa-solid fa-robot"></i> AI Predicted';
                    input.parentElement.appendChild(span);
                }
            }
        }
        // Add sensor badges to climate fields
        ["ph", "temperature", "humidity", "soilMoisture"].forEach(id => {
            const el = document.getElementById(id);
            if (!el || !el.value) return;
            el.classList.add("sensor-filled");
            if (!el.parentElement.querySelector(".sensor-badge")) {
                const span = document.createElement("span");
                span.className = "ai-badge sensor-badge";
                span.innerHTML = '<i class="fa-solid fa-microchip"></i> ESP32 Sensor';
                el.parentElement.appendChild(span);
            }
        });
        // Build a mock sensor data object for the banner
        showAISourceBanner({
            temperature: params.get("temperature"),
            humidity: params.get("humidity"),
            ph: params.get("ph"),
            moisture: params.get("soilMoisture"),
            npk_source: "ai",
            N: Number(params.get("N")),
            P: Number(params.get("P")),
            K: Number(params.get("K")),
        });
        toast("📡 Sensor data + AI-predicted NPK auto-filled from IoT!", "success");
    } else {
        toast("📡 Sensor data auto-filled from IoT!", "success");
    }
}

// ================================================================
//   MARKETPLACE — Autonomous Agri Marketplace Agent
// ================================================================

const MKT_CROP_IMAGES = {
    Rice:"https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=120&h=120&fit=crop",
    Wheat:"https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=120&h=120&fit=crop",
    Maize:"https://images.unsplash.com/photo-1440342359743-84fcb8c21f21?w=120&h=120&fit=crop",
    Cotton:"https://images.unsplash.com/photo-1601472544834-243f5e5c5d70?w=120&h=120&fit=crop",
    Sugarcane:"https://images.unsplash.com/photo-1601593768498-3540b8aa1f3d?w=120&h=120&fit=crop",
    Soybean:"https://images.unsplash.com/photo-1599420186946-7b6fb4e297f0?w=120&h=120&fit=crop",
    Groundnut:"https://images.unsplash.com/photo-1567892737950-30c4db37cd89?w=120&h=120&fit=crop",
    Mustard:"https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=120&h=120&fit=crop",
    Chili:"https://images.unsplash.com/photo-1588891557811-a0f1a5d294e3?w=120&h=120&fit=crop",
    Onion:"https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=120&h=120&fit=crop",
    Potato:"https://images.unsplash.com/photo-1518977676601-b53f82aba53e?w=120&h=120&fit=crop",
    Tomato:"https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=120&h=120&fit=crop",
    Banana:"https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=120&h=120&fit=crop",
    Mango:"https://images.unsplash.com/photo-1553279768-865429fa0078?w=120&h=120&fit=crop",
    Coconut:"https://images.unsplash.com/photo-1560493676-04071c5f467b?w=120&h=120&fit=crop",
    Coffee:"https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=120&h=120&fit=crop",
    Tea:"https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=120&h=120&fit=crop",
    Jute:"https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=120&h=120&fit=crop",
    Lentil:"https://images.unsplash.com/photo-1515543904279-0a869b2b4cb2?w=120&h=120&fit=crop",
    Chickpea:"https://images.unsplash.com/photo-1515543904279-0a869b2b4cb2?w=120&h=120&fit=crop",
};
const MKT_DEFAULT_IMG = "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=120&h=120&fit=crop";

let _mktBrowseTab = "listings";
let _mktChatListingId = null;
let _mktChatReceiverId = null;
let _mktChatPeerName = "";
let _mktChatInterval = null;

// ── Time helpers ──
function mktTimeAgo(dateStr) {
    if (!dateStr) return "";
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function mktMaskPhone(phone) {
    if (!phone || phone.length < 4) return "N/A";
    return phone.slice(0, -4).replace(/./g, "•") + phone.slice(-4);
}

function mktPriceBadge(price, crop) {
    // Compare price to MSP — returns a colored badge HTML
    // We'll use a rough MSP estimate; actual MSP is returned from API
    return ""; // filled by caller with actual data
}

// ── Role switching (enhanced: auto-show existing listings/demands) ──
function setMarketRole(role) {
    document.getElementById("roleSelector").style.display = role ? "none" : "block";
    document.querySelectorAll(".mkt-view").forEach(v => v.style.display = "none");
    if (role === "seller") {
        document.getElementById("sellerView").style.display = "";
        // Auto-fill state from user profile
        const dataEl = document.getElementById("mktPageData");
        const profileState = dataEl?.dataset.userState || "";
        const profileDistrict = dataEl?.dataset.userDistrict || "";
        if (profileState && document.getElementById("sellState")) {
            document.getElementById("sellState").value = profileState;
        }
        if (profileDistrict && document.getElementById("sellDistrict")) {
            document.getElementById("sellDistrict").value = profileDistrict;
        }
        // Auto-load seller's existing listings & recent matching demands
        loadSellerExistingItems();
    } else if (role === "buyer") {
        document.getElementById("buyerView").style.display = "";
        // Auto-fill buyer state/district from profile
        const dataEl = document.getElementById("mktPageData");
        const profileState = dataEl?.dataset.userState || "";
        const profileDistrict = dataEl?.dataset.userDistrict || "";
        if (profileState && document.getElementById("buyState")) {
            document.getElementById("buyState").value = profileState;
        }
        if (profileDistrict && document.getElementById("buyDistrict")) {
            document.getElementById("buyDistrict").value = profileDistrict;
        }
        // Auto-load buyer's existing demands & recent listings
        loadBuyerExistingItems();
    } else if (role === "browse") {
        document.getElementById("browseView").style.display = "";
        loadBrowseTab();
    }
    loadMarketStats();
}

// ── Load existing items when role is selected ──
async function loadSellerExistingItems() {
    const panel = document.getElementById("sellerExisting");
    if (!panel) return;
    try {
        const d = await api("/api/market/my");
        let html = "";
        // Show user's active listings
        const listings = (d.listings || []).filter(l => l.status === "active");
        if (listings.length > 0) {
            html += `<div class="mkt-existing-header"><i class="fa-solid fa-boxes-stacked"></i> ${t('mktActiveListings')} (${listings.length})</div>`;
            html += '<div class="mkt-browse-grid">' + listings.map(l => renderBrowseListingCard(l)).join("") + '</div>';
        }
        // Show active deals
        const deals = (d.deals || []).filter(dl => dl.status !== "rejected");
        if (deals.length > 0) {
            html += `<div class="mkt-existing-header"><i class="fa-solid fa-handshake"></i> ${t('mktYourDeals')} (${deals.length})</div>`;
            html += '<div class="mkt-browse-grid">' + deals.map(dl => renderDealCard(dl)).join("") + '</div>';
        }
        if (!html) {
            html = `<div class="mkt-existing-empty"><i class="fa-solid fa-lightbulb"></i> ${t('mktNoActiveList')} <button class="mkt-voice-trigger" onclick="mktVoiceListing()"><i class="fa-solid fa-microphone"></i> ${t('mktSpeakToList')}</button></div>`;
        }
        panel.innerHTML = html;
        panel.style.display = "";
    } catch { /* silent */ }
}

async function loadBuyerExistingItems() {
    const panel = document.getElementById("buyerExisting");
    if (!panel) return;
    try {
        const [myData, listingsData] = await Promise.all([
            api("/api/market/my"),
            api("/api/market/listings")
        ]);
        let html = "";
        // Show user's active demands
        const demands = (myData.demands || []).filter(dm => dm.status === "active");
        if (demands.length > 0) {
            html += `<div class="mkt-existing-header"><i class="fa-solid fa-cart-shopping"></i> ${t('mktActiveDemands')} (${demands.length})</div>`;
            html += '<div class="mkt-browse-grid">' + demands.map(dm => renderBrowseDemandCard(dm)).join("") + '</div>';
        }
        // Show recent listings available to buy
        const listings = (listingsData.listings || []).slice(0, 6);
        if (listings.length > 0) {
            html += `<div class="mkt-existing-header"><i class="fa-solid fa-fire"></i> ${t('mktRecentListings')}</div>`;
            html += '<div class="mkt-browse-grid">' + listings.map(l => renderBrowseListingCard(l)).join("") + '</div>';
        }
        // Show active deals
        const deals = (myData.deals || []).filter(dl => dl.status !== "rejected");
        if (deals.length > 0) {
            html += `<div class="mkt-existing-header"><i class="fa-solid fa-handshake"></i> ${t('mktYourDeals')} (${deals.length})</div>`;
            html += '<div class="mkt-browse-grid">' + deals.map(dl => renderDealCard(dl)).join("") + '</div>';
        }
        if (!html) {
            html = `<div class="mkt-existing-empty"><i class="fa-solid fa-search"></i> ${t('mktNoActiveDemand')} <button class="mkt-voice-trigger" onclick="mktVoiceDemand()"><i class="fa-solid fa-microphone"></i> ${t('mktSpeakToSearch')}</button></div>`;
        }
        panel.innerHTML = html;
        panel.style.display = "";
    } catch { /* silent */ }
}

function loadMarketStats() {
    fetch("/api/market/stats").then(r => r.json()).then(d => {
        if (!d.success) return;
        const s = d.stats;
        const el = id => document.getElementById(id);
        if (el("statListings")) el("statListings").textContent = s.active_listings || 0;
        if (el("statDemands")) el("statDemands").textContent = s.active_demands || 0;
        if (el("statDeals")) el("statDeals").textContent = s.total_deals || 0;
        // Top crops ticker
        if (s.top_crops && s.top_crops.length && el("topCropsTicker")) {
            el("topCropsTicker").innerHTML = s.top_crops.map(c =>
                `<span class="mkt-ticker-item"><strong>${c.crop}</strong> ₹${Math.round(c.avg_price)}/q (${c.count})</span>`
            ).join("");
        }
    }).catch(() => {});
}

async function fetchAutoPrice() {
    const crop = document.getElementById("sellCrop").value;
    const quality = document.getElementById("sellQuality").value;
    const state = document.getElementById("sellState").value;
    const hint = document.getElementById("aiPriceHint");
    if (!crop) { hint.style.display = "none"; return; }
    try {
        const d = await api(`/api/market/autoprice?crop=${encodeURIComponent(crop)}&state=${encodeURIComponent(state)}&quality=${encodeURIComponent(quality)}`);
        hint.innerHTML = `<i class="fa-solid fa-robot"></i> AI: <strong>₹${d.auto_price}</strong>/q ${d.msp ? `(MSP ₹${d.msp})` : ""}`;
        hint.style.display = "inline";
        // Pre-fill price if empty
        const priceInput = document.getElementById("sellPrice");
        if (!priceInput.value) priceInput.placeholder = `AI suggests ₹${d.auto_price}`;
    } catch { hint.style.display = "none"; }
}

function toggleDeliveryCheck(cb) {
    cb.closest('.mkt-delivery-check').classList.toggle('active', cb.checked);
}

// ── Seller listing ──
async function submitSellerListing(e) {
    e.preventDefault();
    const btn = document.getElementById("sellSubmitBtn");
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Listing…';
    try {
        const body = {
            crop: document.getElementById("sellCrop").value,
            qty_kg: parseInt(document.getElementById("sellQty").value),
            quality: document.getElementById("sellQuality").value,
            ask_price: parseFloat(document.getElementById("sellPrice").value) || 0,
            state: document.getElementById("sellState").value,
            district: document.getElementById("sellDistrict").value,
            description: document.getElementById("sellDesc").value,
            delivery_options: Array.from(document.querySelectorAll('input[name="sellDelivery"]:checked')).map(c => c.value).join(',') || 'pickup',
            seller_address: document.getElementById("sellAddress").value,
        };
        const d = await api("/api/market/listing", {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)
        });
        // Upload photos if any pending
        if (_mktPendingPhotos.length > 0 && d.listing?.id) {
            toast(t('mktUploadingPhotos') || 'Uploading photos...', 'info');
            await uploadPhotosForListing(d.listing.id);
        }
        toast(t('mktListingCreated'), "success");
        renderSellerResults(d);
        // WA notification
        if (d.matches && d.matches.length > 0) {
            setTimeout(() => toast(`${d.matches.length} ${t('mktBuyersMatch')}`, "success"), 1500);
        }
    } catch (err) { toast(err.message, "error"); }
    btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-bolt"></i> ${t('mktListMatch')}`;
}

function renderSellerResults(d) {
    const panel = document.getElementById("sellerResults");
    panel.style.display = "";
    const ls = d.listing;
    document.getElementById("sellerListingSummary").innerHTML = `
        <h4><i class="fa-solid fa-check-circle"></i> ${t('mktListingLive')}</h4>
        <div class="mkt-ls-row"><span>${t('mktCropLabel')}</span><strong>${ls.crop}</strong></div>
        <div class="mkt-ls-row"><span>${t('mktQuantity')}</span><strong>${ls.qty_kg} kg (${(ls.qty_kg/100).toFixed(1)} quintals)</strong></div>
        <div class="mkt-ls-row"><span>${t('mktAskPriceL')}</span><strong>₹${ls.ask_price}/quintal</strong></div>
        <div class="mkt-ls-row"><span>${t('mktAIPrice')}</span><strong>₹${ls.auto_price}/quintal</strong></div>
        <div class="mkt-ls-row"><span>${t('mktTotalValue')}</span><strong>₹${Math.round(ls.ask_price * ls.qty_kg / 100).toLocaleString("en-IN")}</strong></div>
        <div class="mkt-ls-row"><span>${t('mktLocationL')}</span><strong>${[ls.district, ls.state].filter(Boolean).join(", ") || "India"}</strong></div>
        <div style="margin-top:.75rem;display:flex;gap:.35rem;flex-wrap:wrap">
            <button class="mkt-btn-wa" onclick="shareWAListing('${ls.crop}',${ls.qty_kg},${ls.ask_price},'${ls.state}')"><i class="fa-brands fa-whatsapp"></i> ${t('mktShareWA')}</button>
        </div>
    `;
    // Matches
    const list = document.getElementById("sellerMatchList");
    if (!d.matches || d.matches.length === 0) {
        list.innerHTML = `<div class="mkt-empty"><i class="fa-solid fa-satellite-dish"></i><p>${t('mktNoMatchBuyer')}</p></div>`;
        return;
    }
    list.innerHTML = `<p style="font-size:.85rem;color:var(--text-light);margin:0 0 .75rem"><i class="fa-solid fa-bullseye"></i> <strong>${d.matches.length}</strong> ${t('mktBuyersMatch')}</p>` +
        d.matches.map(m => renderMatchCard(m, "buyer")).join("");
}

// ── Buyer demand ──
async function submitBuyerDemand(e) {
    e.preventDefault();
    const btn = document.getElementById("buySubmitBtn");
    btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('mktSearching')}`;
    try {
        const body = {
            crop: document.getElementById("buyCrop").value,
            qty_kg: parseInt(document.getElementById("buyQty").value),
            max_price: parseFloat(document.getElementById("buyMaxPrice").value) || 0,
            state: document.getElementById("buyState").value,
            district: document.getElementById("buyDistrict").value,
        };
        const d = await api("/api/market/demand", {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)
        });
        toast(t('mktDemandPosted'), "success");
        renderBuyerResults(d);
        if (d.matches && d.matches.length > 0) {
            setTimeout(() => toast(`${d.matches.length} ${t('mktSellersFound')}`, "success"), 1500);
        }
    } catch (err) { toast(err.message, "error"); }
    btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-bolt"></i> ${t('mktFindSellers')}`;
}

function renderBuyerResults(d) {
    const panel = document.getElementById("buyerResults");
    panel.style.display = "";
    const list = document.getElementById("buyerMatchList");
    if (!d.matches || d.matches.length === 0) {
        list.innerHTML = `<div class="mkt-empty"><i class="fa-solid fa-satellite-dish"></i><p>${t('mktNoMatchSeller')}</p></div>`;
        return;
    }
    list.innerHTML = `<p style="font-size:.85rem;color:var(--text-light);margin:0 0 .75rem"><i class="fa-solid fa-magnifying-glass-chart"></i> <strong>${d.matches.length}</strong> ${t('mktSellersFound')}</p>` +
        d.matches.map(m => renderMatchCard(m, "seller")).join("");
}

// ── Match card (shared by seller matches & buyer matches) ──
function renderMatchCard(m, type) {
    const scoreClass = m.score >= 70 ? "high" : m.score >= 40 ? "med" : "low";
    const img = MKT_CROP_IMAGES[m.crop] || MKT_DEFAULT_IMG;
    const loc = [m.district, m.state].filter(Boolean).join(", ");
    const name = type === "seller" ? (m.seller_name || t('mktFarmer')) : (m.buyer_name || t('mktBuyer'));
    const phone = type === "seller" ? m.seller_phone : m.buyer_phone;
    const priceLabel = type === "seller" ? `₹${m.ask_price || m.auto_price}/q` : `${t('mktMax')} ₹${m.max_price}/q`;
    const qtyLabel = `${m.qty_kg} kg`;
    const id = m.id;
    const uid = m.user_id;
    const timeStr = mktTimeAgo(m.created_at);

    // WhatsApp direct link
    const waText = type === "seller"
        ? `Hi ${name}, I saw your ${m.crop} listing on Kisan Salahkar. Qty: ${m.qty_kg}kg at ₹${m.ask_price}/q. I am interested. Please reply.`
        : `Hi ${name}, I saw your demand for ${m.crop} (${m.qty_kg}kg, max ₹${m.max_price}/q) on Kisan Salahkar. I have stock available.`;
    const waHref = phone ? `https://wa.me/91${phone.replace(/\D/g,"")}?text=${encodeURIComponent(waText)}` : "";

    // Action buttons based on type
    let actions = "";
    if (type === "seller") {
        actions = `<button class="mkt-btn-offer" onclick="openDealModal(${id},'${m.crop}',${m.ask_price},${m.qty_kg})"><i class="fa-solid fa-handshake"></i> ${t('mktOffer')}</button>`;
    }
    if (waHref) {
        actions += `<a class="mkt-btn-wa" href="${waHref}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i></a>`;
    }
    if (phone) {
        actions += `<a class="mkt-btn-call" href="tel:+91${phone.replace(/\D/g,"")}"><i class="fa-solid fa-phone"></i></a>`;
    }
    actions += `<button class="mkt-btn-chat" onclick="openChat(${type === 'seller' ? id : 0}, ${uid}, '${name}')"><i class="fa-solid fa-comments"></i></button>`;

    const phoneDisplay = phone ? mktMaskPhone(phone) : "";

    return `<div class="mkt-match-card">
        <div class="mkt-match-score ${scoreClass}">${m.score}<small>%</small></div>
        <img class="mkt-crop-thumb" src="${img}" alt="${m.crop}" loading="lazy">
        <div class="mkt-match-info">
            <h4>${m.crop} — ${name}</h4>
            <div class="mkt-match-meta">
                <span><i class="fa-solid fa-weight-scale"></i> ${qtyLabel}</span>
                <span><i class="fa-solid fa-indian-rupee-sign"></i> ${priceLabel}</span>
                ${loc ? `<span><i class="fa-solid fa-location-dot"></i> ${loc}</span>` : ""}
                ${phoneDisplay ? `<span><i class="fa-solid fa-phone"></i> ${phoneDisplay}</span>` : ""}
                ${timeStr ? `<span><i class="fa-regular fa-clock"></i> ${timeStr}</span>` : ""}
            </div>
        </div>
        <div class="mkt-match-actions">${actions}</div>
    </div>`;
}

// ── Browse ──
function switchBrowseTab(tab, btn) {
    _mktBrowseTab = tab;
    document.querySelectorAll(".mkt-tab").forEach(t => t.classList.remove("active"));
    if (btn) btn.classList.add("active");
    loadBrowseTab();
}

async function loadBrowseTab() {
    const content = document.getElementById("browseContent");
    const crop = document.getElementById("browseFilterCrop")?.value || "";
    const state = document.getElementById("browseFilterState")?.value || "";
    content.innerHTML = `<div class="mkt-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>${t('mktLoading')}</p></div>`;
    try {
        if (_mktBrowseTab === "listings") {
            const d = await api(`/api/market/listings?crop=${encodeURIComponent(crop)}&state=${encodeURIComponent(state)}`);
            if (!d.listings || d.listings.length === 0) {
                content.innerHTML = `<div class="mkt-empty"><i class="fa-solid fa-box-open"></i><p>${t('mktNoActiveListBrowse')} <button class="mkt-browse-link" onclick="setMarketRole('seller')">${t('mktSellNow')}</button></p></div>`;
                return;
            }
            content.innerHTML = `<p class="mkt-browse-count"><strong>${d.listings.length}</strong> ${t('mktActiveListCount')}</p><div class="mkt-browse-grid">` + d.listings.map(l => renderBrowseListingCard(l)).join("") + '</div>';
        } else if (_mktBrowseTab === "demands") {
            const d = await api(`/api/market/demands?crop=${encodeURIComponent(crop)}&state=${encodeURIComponent(state)}`);
            if (!d.demands || d.demands.length === 0) {
                content.innerHTML = `<div class="mkt-empty"><i class="fa-solid fa-box-open"></i><p>${t('mktNoActiveDemandBrowse')} <button class="mkt-browse-link" onclick="setMarketRole('buyer')">${t('mktPostDemand')}</button></p></div>`;
                return;
            }
            content.innerHTML = `<p class="mkt-browse-count"><strong>${d.demands.length}</strong> ${t('mktActiveDemandCount')}</p><div class="mkt-browse-grid">` + d.demands.map(dm => renderBrowseDemandCard(dm)).join("") + '</div>';
        } else if (_mktBrowseTab === "myitems") {
            const d = await api("/api/market/my");
            content.innerHTML = renderMyItems(d);
        }
    } catch (err) {
        content.innerHTML = `<div class="mkt-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>${err.message}</p></div>`;
    }
}

function renderBrowseListingCard(l) {
    const img = MKT_CROP_IMAGES[l.crop] || MKT_DEFAULT_IMG;
    const loc = [l.district, l.state].filter(Boolean).join(", ");
    const phone = l.seller_phone || "";
    const timeStr = mktTimeAgo(l.created_at);
    const totalVal = Math.round(l.ask_price * l.qty_kg / 100);
    const waText = `Hi ${l.seller_name || t('mktFarmer')}, I'm interested in your ${l.crop} (${l.qty_kg}kg, ₹${l.ask_price}/q) on Kisan Salahkar. Is it still available?`;
    const waHref = phone ? `https://wa.me/91${phone.replace(/\D/g,"")}?text=${encodeURIComponent(waText)}` : "";
    // Parse photos
    const photoGallery = renderListingPhotos(l.photos);
    // Delivery badges
    const deliveryOpts = (l.delivery_options || 'pickup').split(',').map(s => s.trim()).filter(Boolean);
    const deliveryIcons = {pickup:'fa-person-walking-luggage', delivery:'fa-truck', mandi:'fa-store'};
    const deliveryLabels = {pickup: t('mktPickup') || 'Self Pickup', delivery: t('mktDelivery') || 'Home Delivery', mandi: t('mktMandiPickup') || 'Mandi Pickup'};
    const deliveryHTML = deliveryOpts.length ? `<div class="mkt-listing-delivery"><i class="fa-solid fa-truck-fast"></i> ${deliveryOpts.map(o => `<span class="mkt-delivery-badge mkt-db-${o}"><i class="fa-solid ${deliveryIcons[o] || 'fa-box'}"></i> ${deliveryLabels[o] || o}</span>`).join('')}${l.seller_address ? `<span class="mkt-seller-loc"><i class="fa-solid fa-location-dot"></i> ${l.seller_address}</span>` : ''}</div>` : '';

    return `<div class="mkt-browse-card">
        ${photoGallery ? photoGallery : ''}
        <div class="mkt-browse-card-top">
            <img class="mkt-crop-thumb" src="${img}" alt="${l.crop}" loading="lazy">
            <div>
                <h4>${l.crop} <span class="mkt-quality-badge mkt-q-${l.quality}">${l.quality}</span></h4>
                <small>${l.seller_name || t('mktFarmer')} ${loc ? "• " + loc : ""}</small>
            </div>
            <div style="margin-left:auto;text-align:right">
                <span class="mkt-status-badge mkt-status-${l.status}">${l.status}</span>
                ${timeStr ? `<div class="mkt-time">${timeStr}</div>` : ""}
            </div>
        </div>
        <div class="mkt-card-details">
            <span><i class="fa-solid fa-weight-scale"></i> ${l.qty_kg} kg</span>
            <span><i class="fa-solid fa-indian-rupee-sign"></i> <strong>₹${l.ask_price}/q</strong></span>
            <span><i class="fa-solid fa-gem"></i> ${l.quality}</span>
            <span><i class="fa-solid fa-calculator"></i> ≈ ₹${totalVal.toLocaleString("en-IN")}</span>
            <span><i class="fa-solid fa-robot"></i> AI: ₹${l.auto_price}/q</span>
            ${phone ? `<span><i class="fa-solid fa-phone"></i> ${mktMaskPhone(phone)}</span>` : ""}
        </div>
        ${deliveryHTML}
        ${l.description ? `<p class="mkt-card-desc">${l.description}</p>` : ""}
        <div class="mkt-card-actions">
            <button class="mkt-btn-offer" onclick="openDealModal(${l.id},'${l.crop}',${l.ask_price},${l.qty_kg})"><i class="fa-solid fa-handshake"></i> ${t('mktOffer')}</button>
            ${waHref ? `<a class="mkt-btn-wa" href="${waHref}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ""}
            ${phone ? `<a class="mkt-btn-call" href="tel:+91${phone.replace(/\D/g,"")}"><i class="fa-solid fa-phone"></i> ${t('mktCall')}</a>` : ""}
            <button class="mkt-btn-chat" onclick="openChat(${l.id}, ${l.user_id}, '${l.seller_name || t('mktFarmer')}')"><i class="fa-solid fa-comments"></i> ${t('mktChat')}</button>
        </div>
    </div>`;
}

function renderBrowseDemandCard(dm) {
    const img = MKT_CROP_IMAGES[dm.crop] || MKT_DEFAULT_IMG;
    const loc = [dm.district, dm.state].filter(Boolean).join(", ");
    const phone = dm.buyer_phone || "";
    const timeStr = mktTimeAgo(dm.created_at);
    const waText = `Hi ${dm.buyer_name || t('mktBuyer')}, I have ${dm.crop} available. You posted demand for ${dm.qty_kg}kg at ₹${dm.max_price}/q on Kisan Salahkar.`;
    const waHref = phone ? `https://wa.me/91${phone.replace(/\D/g,"")}?text=${encodeURIComponent(waText)}` : "";

    return `<div class="mkt-browse-card">
        <div class="mkt-browse-card-top">
            <img class="mkt-crop-thumb" src="${img}" alt="${dm.crop}" loading="lazy">
            <div>
                <h4>${dm.crop}</h4>
                <small>${dm.buyer_name || t('mktBuyer')} ${loc ? "• " + loc : ""}</small>
            </div>
            <div style="margin-left:auto;text-align:right">
                <span class="mkt-status-badge mkt-status-${dm.status}">${dm.status}</span>
                ${timeStr ? `<div class="mkt-time">${timeStr}</div>` : ""}
            </div>
        </div>
        <div class="mkt-card-details">
            <span><i class="fa-solid fa-weight-scale"></i> ${dm.qty_kg} kg</span>
            <span><i class="fa-solid fa-indian-rupee-sign"></i> <strong>${t('mktMax')} ₹${dm.max_price}/q</strong></span>
            <span><i class="fa-solid fa-location-dot"></i> ${loc || t('mktAnyLocation')}</span>
            ${phone ? `<span><i class="fa-solid fa-phone"></i> ${mktMaskPhone(phone)}</span>` : ""}
        </div>
        <div class="mkt-card-actions">
            ${waHref ? `<a class="mkt-btn-wa" href="${waHref}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ""}
            ${phone ? `<a class="mkt-btn-call" href="tel:+91${phone.replace(/\D/g,"")}"><i class="fa-solid fa-phone"></i> ${t('mktCall')}</a>` : ""}
            <button class="mkt-btn-chat" onclick="openChat(0, ${dm.user_id}, '${dm.buyer_name || t('mktBuyer')}')"><i class="fa-solid fa-comments"></i> ${t('mktChat')}</button>
        </div>
    </div>`;
}

function renderMyItems(d) {
    let html = "";
    // My Listings
    html += `<h3 class="mkt-section-head"><i class="fa-solid fa-boxes-stacked"></i> ${t('mktMyListings')} (${(d.listings||[]).length})</h3>`;
    if (!d.listings || d.listings.length === 0) {
        html += `<div class="mkt-empty"><p>${t('mktNoListings')} <button class="mkt-browse-link" onclick="setMarketRole('seller')">${t('mktSellNow')}</button></p></div>`;
    } else {
        html += '<div class="mkt-browse-grid">' + d.listings.map(l => renderBrowseListingCard(l)).join("") + '</div>';
    }
    // My Demands
    html += `<h3 class="mkt-section-head"><i class="fa-solid fa-cart-shopping"></i> ${t('mktMyDemands')} (${(d.demands||[]).length})</h3>`;
    if (!d.demands || d.demands.length === 0) {
        html += `<div class="mkt-empty"><p>${t('mktNoDemands')} <button class="mkt-browse-link" onclick="setMarketRole('buyer')">${t('mktPostDemand')}</button></p></div>`;
    } else {
        html += '<div class="mkt-browse-grid">' + d.demands.map(dm => renderBrowseDemandCard(dm)).join("") + '</div>';
    }
    // My Deals
    html += `<h3 class="mkt-section-head"><i class="fa-solid fa-handshake"></i> ${t('mktMyDeals')} (${(d.deals||[]).length})</h3>`;
    if (!d.deals || d.deals.length === 0) {
        html += `<div class="mkt-empty"><p>${t('mktNoDeals')}</p></div>`;
    } else {
        html += '<div class="mkt-browse-grid">' + d.deals.map(dl => renderDealCard(dl)).join("") + '</div>';
    }
    return html;
}

function renderDealCard(dl) {
    const img = MKT_CROP_IMAGES[dl.crop] || MKT_DEFAULT_IMG;
    const timeStr = mktTimeAgo(dl.created_at);
    const stages = ["pending", "countered", "accepted", "paid"];
    const pmtStatus = dl.payment_status || "unpaid";
    let currentIdx = stages.indexOf(dl.status);
    if (dl.status === "accepted" && pmtStatus === "paid") currentIdx = 3;
    const stageLabels = [t('mktOffered'), t('mktNegotiating'), t('mktConfirmed'), t('mktPaid') || '💰 Paid'];
    const progressHTML = `<div class="mkt-deal-progress">
        ${stageLabels.map((label, i) =>
            `<div class="mkt-deal-step ${i <= currentIdx ? "active" : ""} ${i === currentIdx ? "current" : ""}">
                <div class="mkt-deal-dot"></div><span>${label}</span>
            </div>`
        ).join('<div class="mkt-deal-line"></div>')}
    </div>`;

    // Contact info for the other party
    const sellerPhone = dl.seller_phone || "";
    const buyerPhone = dl.buyer_phone || "";
    const otherName = dl.seller_name;
    const otherPhone = sellerPhone || buyerPhone;
    const waText = `Regarding Kisan Salahkar Deal #${dl.id}: ${dl.crop}, ${dl.qty_kg}kg at ₹${dl.deal_price}/q (Total: ₹${dl.total_amount})`;
    const waHref = otherPhone ? `https://wa.me/91${otherPhone.replace(/\D/g,"")}?text=${encodeURIComponent(waText)}` : "";

    return `<div class="mkt-browse-card mkt-deal-card-border-${dl.status}">
        <div class="mkt-browse-card-top">
            <img class="mkt-crop-thumb" src="${img}" alt="${dl.crop}" loading="lazy">
            <div>
                <h4>${dl.crop} ${t('mktDealDone')} <small>#${dl.id}</small></h4>
                <small>${dl.seller_name} ↔ ${dl.buyer_name}</small>
            </div>
            <div style="margin-left:auto;text-align:right">
                <span class="mkt-status-badge mkt-status-${dl.status}">${dl.status}</span>
                ${timeStr ? `<div class="mkt-time">${timeStr}</div>` : ""}
            </div>
        </div>
        ${progressHTML}
        <div class="mkt-card-details">
            <span><i class="fa-solid fa-weight-scale"></i> ${dl.qty_kg} kg</span>
            <span><i class="fa-solid fa-indian-rupee-sign"></i> <strong>₹${dl.deal_price}/q</strong></span>
            <span><i class="fa-solid fa-calculator"></i> ${t('mktTotal')}: <strong>₹${dl.total_amount.toLocaleString("en-IN")}</strong></span>
            ${(dl.payment_status && dl.payment_status !== 'unpaid') ? `<span class="mkt-deal-payment-badge ${dl.payment_status}"><i class="fa-solid fa-${dl.payment_status === 'paid' ? 'circle-check' : 'hourglass-half'}"></i> ${dl.payment_status === 'paid' ? (t('mktPaid') || 'Paid') : (t('mktPayPending') || 'Payment Pending')}</span>` : ''}
        </div>
        ${dl.delivery_type && dl.delivery_type !== 'pickup' ? `<div class="mkt-deal-logistics"><i class="fa-solid fa-truck-fast"></i> ${dl.delivery_type === 'delivery' ? (t('mktDelivery') || 'Home Delivery') : (t('mktMandiPickup') || 'Mandi Pickup')} ${dl.transport_cost > 0 ? `• ₹${dl.transport_cost} transport` : ''}</div>` : ''}
        <div class="mkt-card-actions">
            ${dl.status === "pending" || dl.status === "countered" ? `
                <button class="mkt-btn-offer" onclick="dealAction(${dl.id},'accept')"><i class="fa-solid fa-check"></i> ${t('mktAccept')}</button>
                <button class="mkt-btn-counter" onclick="dealAction(${dl.id},'counter')"><i class="fa-solid fa-rotate"></i> ${t('mktCounter')}</button>
                <button class="mkt-btn-reject" onclick="dealAction(${dl.id},'reject')"><i class="fa-solid fa-xmark"></i> ${t('mktReject')}</button>
            ` : ""}
            ${dl.status === "accepted" ? `
                <button class="mkt-btn-logistics" onclick='openLogisticsModal(${dl.id}, ${JSON.stringify({delivery_type:dl.delivery_type||"pickup",pickup_address:dl.pickup_address||"",delivery_address:dl.delivery_address||"",transport_cost:dl.transport_cost||0})})'><i class="fa-solid fa-truck-fast"></i> ${t('mktLogistics') || 'Logistics'}</button>
                <button class="mkt-btn-pay" onclick='openPaymentModal(${dl.id}, ${JSON.stringify({crop:dl.crop,qty_kg:dl.qty_kg,deal_price:dl.deal_price,total_amount:dl.total_amount,transport_cost:dl.transport_cost||0,payment_status:dl.payment_status||"unpaid"})})'><i class="fa-solid fa-credit-card"></i> ${dl.payment_status === 'paid' ? (t('mktPaid') || '✅ Paid') : (t('mktPayNow') || 'Pay Now')}</button>
            ` : ""}
            ${waHref ? `<a class="mkt-btn-wa" href="${waHref}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ""}
            ${dl.status === "accepted" ? `<button class="mkt-btn-wa" onclick="shareWAContract(${dl.id},'${dl.crop}',${dl.qty_kg},${dl.deal_price},${dl.total_amount},'${dl.seller_name}','${dl.buyer_name}')"><i class="fa-brands fa-whatsapp"></i> ${t('mktShareContract')}</button>` : ""}
        </div>
    </div>`;
}

// ── Deal Modal (enhanced) ──
function openDealModal(listingId, crop, askPrice, maxQty) {
    const modal = document.getElementById("dealModal");
    const content = document.getElementById("dealModalContent");
    const img = MKT_CROP_IMAGES[crop] || MKT_DEFAULT_IMG;
    content.innerHTML = `
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem">
            <img src="${img}" style="width:48px;height:48px;border-radius:12px;object-fit:cover" alt="${crop}">
            <div><h3 style="margin:0">${t('mktMakeOffer')} — ${crop}</h3><p style="margin:0;font-size:.82rem;color:var(--text-light)">${t('mktSellerAsks')} ₹${askPrice}/quintal • ${t('mktMax')} ${maxQty} kg ${t('mktAvailable')}</p></div>
        </div>
        <div class="input-group">
            <label for="offerPrice">${t('mktYourPrice')}</label>
            <input type="number" id="offerPrice" min="1" step="1" value="${askPrice}" placeholder="${askPrice}">
            <small style="color:var(--text-light)">${t('mktIfPriceGte')} ₹${askPrice}, ${t('mktAutoAcceptHint')}</small>
        </div>
        <div class="input-group">
            <label for="offerQty">${t('mktOfferQty')}</label>
            <input type="number" id="offerQty" min="1" max="${maxQty}" step="1" value="${maxQty}" placeholder="${maxQty}">
        </div>
        <div class="mkt-offer-preview" id="offerPreview"></div>
        <div class="crop-form-actions" style="margin-top:1rem">
            <button class="btn btn-voice-sm" onclick="closeDealModal()">${t('mktCancel')}</button>
            <button class="btn btn-predict" onclick="makeOffer(${listingId})"><i class="fa-solid fa-paper-plane"></i> ${t('mktSendOffer')}</button>
        </div>
    `;
    // Live preview
    const updatePreview = () => {
        const p = parseFloat(document.getElementById("offerPrice")?.value) || 0;
        const q = parseInt(document.getElementById("offerQty")?.value) || 0;
        const total = Math.round(p * q / 100);
        const preview = document.getElementById("offerPreview");
        if (preview) {
            const auto = p >= askPrice;
            preview.innerHTML = `<div class="mkt-offer-preview-inner ${auto ? 'auto' : 'pending'}">
                <span><i class="fa-solid fa-calculator"></i> ${t('mktTotal')}: <strong>₹${total.toLocaleString("en-IN")}</strong></span>
                <span>${auto ? `<i class="fa-solid fa-bolt" style="color:#f59e0b"></i> ${t('mktAutoAcceptBang')}` : `<i class="fa-solid fa-hourglass-half"></i> ${t('mktPendingApproval')}`}</span>
            </div>`;
        }
    };
    modal.style.display = "flex";
    setTimeout(() => {
        document.getElementById("offerPrice")?.addEventListener("input", updatePreview);
        document.getElementById("offerQty")?.addEventListener("input", updatePreview);
        updatePreview();
    }, 50);
}
function closeDealModal() { document.getElementById("dealModal").style.display = "none"; }

async function makeOffer(listingId) {
    const price = parseFloat(document.getElementById("offerPrice").value);
    const qty = parseInt(document.getElementById("offerQty").value);
    if (!price || !qty) { toast(t('mktEnterPriceQty'), "error"); return; }
    try {
        const d = await api("/api/market/offer", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ listing_id: listingId, offer_price: price, qty_kg: qty })
        });
        closeDealModal();
        if (d.status === "accepted") {
            toast(t('mktDealAutoAccepted'), "success");
            // Auto-open WhatsApp contract
            if (d.seller_phone) {
                const waUrl = `https://wa.me/91${d.seller_phone.replace(/\D/g,"")}?text=${encodeURIComponent(d.wa_message)}`;
                setTimeout(() => window.open(waUrl, "_blank"), 800);
            } else if (d.wa_message) {
                const waUrl = `https://wa.me/?text=${encodeURIComponent(d.wa_message)}`;
                setTimeout(() => window.open(waUrl, "_blank"), 800);
            }
        } else {
            toast(t('mktOfferSent'), "info");
            if (d.seller_phone) {
                // Notify seller via WA
                const notifyText = `New offer on your ${d.deal?.crop || "crop"} listing on Kisan Salahkar! Price: ₹${price}/q, Qty: ${qty}kg. Open the app to accept/counter.`;
                setTimeout(() => {
                    if (confirm(t('mktSendWANotify'))) {
                        window.open(`https://wa.me/91${d.seller_phone.replace(/\D/g,"")}?text=${encodeURIComponent(notifyText)}`, "_blank");
                    }
                }, 500);
            }
        }
    } catch (err) { toast(err.message, "error"); }
}

async function dealAction(dealId, action) {
    if (action === "counter") {
        const cp = prompt(t('mktCounterPrice'));
        if (!cp) return;
        try {
            const d = await api(`/api/market/deal/${dealId}`, {
                method: "PUT", headers: {"Content-Type":"application/json"},
                body: JSON.stringify({ action: "counter", counter_price: parseFloat(cp) })
            });
            toast(`${t('mktCounterSent')} ₹${cp}/quintal (${t('mktTotal')}: ₹${d.total})`, "success");
            loadBrowseTab();
        } catch (err) { toast(err.message, "error"); }
        return;
    }
    if (action === "reject" && !confirm(t('mktRejectConfirm'))) return;
    try {
        await api(`/api/market/deal/${dealId}`, {
            method: "PUT", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ action })
        });
        toast(`${t('mktDealDone')} ${action === 'accept' ? t('mktDealAccepted') : t('mktDealRejected')}!`, action === "accept" ? "success" : "info");
        loadBrowseTab();
    } catch (err) { toast(err.message, "error"); }
}

// ── Chat (enhanced with real-time feel) ──
function openChat(listingId, receiverId, peerName) {
    _mktChatListingId = listingId;
    _mktChatReceiverId = receiverId;
    _mktChatPeerName = peerName || "User";
    const modal = document.getElementById("chatModal");
    const header = document.getElementById("chatPeerName");
    if (header) header.textContent = _mktChatPeerName;
    modal.style.display = "flex";
    loadChatMessages();
    // Poll for new messages every 5 seconds
    if (_mktChatInterval) clearInterval(_mktChatInterval);
    _mktChatInterval = setInterval(loadChatMessages, 5000);
}
function closeChatModal() {
    document.getElementById("chatModal").style.display = "none";
    _mktChatListingId = null; _mktChatReceiverId = null;
    if (_mktChatInterval) { clearInterval(_mktChatInterval); _mktChatInterval = null; }
}

async function loadChatMessages() {
    const body = document.getElementById("chatMessages");
    if (_mktChatListingId === null && !_mktChatReceiverId) return;
    const lid = _mktChatListingId || 0;
    const peerParam = lid === 0 && _mktChatReceiverId ? `?peer=${_mktChatReceiverId}` : "";
    try {
        const d = await api(`/api/market/chat/${lid}${peerParam}`);
        if (!d.messages || d.messages.length === 0) {
            body.innerHTML = `<div class="mkt-empty" style="padding:1.5rem"><i class="fa-solid fa-comments"></i><p>${t('mktNoMessages')} <strong>${_mktChatPeerName}</strong>!</p></div>`;
            return;
        }
        const prevScroll = body.scrollTop;
        const wasAtBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 50;
        body.innerHTML = d.messages.map(msg => {
            const cls = msg.is_mine ? "sent" : "received";
            const time = new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
            const dateStr = new Date(msg.created_at).toLocaleDateString("en-IN", {day:"numeric",month:"short"});
            return `<div class="mkt-chat-msg ${cls}">
                <div>${msg.message}</div>
                <div class="chat-meta">${msg.is_mine ? t('mktYou') : (msg.sender_name || "")} • ${dateStr} ${time}</div>
            </div>`;
        }).join("");
        if (wasAtBottom) body.scrollTop = body.scrollHeight;
    } catch { /* silent */ }
}

async function sendChatMsg(e) {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    const lid = _mktChatListingId || 0;
    try {
        const d = await api(`/api/market/chat/${lid}`, {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ message: msg, receiver_id: _mktChatReceiverId })
        });
        loadChatMessages();
        // WhatsApp alert to receiver if phone available
        if (d.receiver_phone) {
            const waText = `💬 New message on Kisan Salahkar Marketplace from ${d.sender_name || "a user"}:\n\n"${msg.substring(0, 100)}"\n\nOpen the app to reply.`;
            const waNotify = document.getElementById("mktWaNotifyBar");
            if (waNotify) {
                waNotify.style.display = "flex";
                waNotify.innerHTML = `<span><i class="fa-brands fa-whatsapp"></i> ${t('mktNotifyWA')} ${_mktChatPeerName}</span>
                    <a class="mkt-wa-notify-btn" href="https://wa.me/91${d.receiver_phone.replace(/\\D/g,"")}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> ${t('mktSend')}</a>
                    <button class="mkt-wa-notify-dismiss" onclick="this.parentElement.style.display='none'">&times;</button>`;
                setTimeout(() => { waNotify.style.display = "none"; }, 12000);
            }
        }
    } catch (err) { toast(err.message, "error"); }
}

// Quick-reply for chat
function sendQuickReply(text) {
    document.getElementById("chatInput").value = text;
    document.getElementById("chatInput").focus();
}

// ── WhatsApp helpers (enhanced with proper messages) ──
function shareWAListing(crop, qty, price, state) {
    const text = `🌾 *Kisan Salahkar Marketplace*\n\n` +
        `📢 *Fresh Crop Available for Sale!*\n\n` +
        `🌱 Crop: *${crop}*\n` +
        `⚖️ Quantity: *${qty} kg*\n` +
        `💰 Price: *₹${price}/quintal*\n` +
        `📍 Location: *${state || "India"}*\n\n` +
        `Interested? Reply to this message or visit Kisan Salahkar to make a deal!\n\n` +
        `_Powered by Kisan Salahkar — AI Agriculture Advisory_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

function shareWAContract(dealId, crop, qty, price, total, seller, buyer) {
    const text = `✅ *Kisan Salahkar — Trade Contract*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📋 Contract #${dealId}\n\n` +
        `🌱 Crop: *${crop}*\n` +
        `⚖️ Quantity: *${qty} kg*\n` +
        `💰 Price: *₹${price}/quintal*\n` +
        `💵 Total Amount: *₹${total}*\n\n` +
        `👨‍🌾 Seller: *${seller}*\n` +
        `🛒 Buyer: *${buyer}*\n\n` +
        `📅 Date: ${new Date().toLocaleDateString("en-IN")}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `_This is an auto-generated trade contract from Kisan Salahkar Agri Marketplace._`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

// ================================================================
//  VOICE INPUT FOR MARKETPLACE — Speak to List/Buy
// ================================================================
const MKT_CROP_NAMES_MAP = {
    "rice": "Rice", "chawal": "Rice", "dhan": "Rice", "धान": "Rice", "चावल": "Rice",
    "wheat": "Wheat", "gehun": "Wheat", "गेहूं": "Wheat", "gehu": "Wheat",
    "maize": "Maize", "makka": "Maize", "मक्का": "Maize", "corn": "Maize",
    "cotton": "Cotton", "kapas": "Cotton", "कपास": "Cotton",
    "sugarcane": "Sugarcane", "ganna": "Sugarcane", "गन्ना": "Sugarcane",
    "soybean": "Soybean", "soyabean": "Soybean", "सोयाबीन": "Soybean",
    "groundnut": "Groundnut", "mungfali": "Groundnut", "मूंगफली": "Groundnut",
    "mustard": "Mustard", "sarson": "Mustard", "सरसों": "Mustard",
    "chili": "Chili", "mirch": "Chili", "mirchi": "Chili", "मिर्च": "Chili",
    "onion": "Onion", "pyaz": "Onion", "pyaaz": "Onion", "प्याज": "Onion",
    "potato": "Potato", "aloo": "Potato", "aaloo": "Potato", "आलू": "Potato",
    "tomato": "Tomato", "tamatar": "Tomato", "टमाटर": "Tomato",
    "banana": "Banana", "kela": "Banana", "केला": "Banana",
    "mango": "Mango", "aam": "Mango", "आम": "Mango",
    "coconut": "Coconut", "nariyal": "Coconut", "नारियल": "Coconut",
    "coffee": "Coffee", "कॉफी": "Coffee",
    "tea": "Tea", "chai": "Tea", "चाय": "Tea",
    "jute": "Jute", "joot": "Jute", "जूट": "Jute",
    "lentil": "Lentil", "dal": "Lentil", "दाल": "Lentil", "masoor": "Lentil",
    "chickpea": "Chickpea", "chana": "Chickpea", "चना": "Chickpea",
};

const MKT_QUALITY_MAP = {
    "premium": "premium", "best": "premium", "achha": "premium", "acha": "premium", "achchi": "premium", "उत्तम": "premium", "badhiya": "premium", "बढ़िया": "premium",
    "standard": "standard", "normal": "standard", "saamanya": "standard", "सामान्य": "standard", "theek": "standard",
    "fair": "fair", "thik": "fair", "ठीक": "fair", "average": "fair", "ok": "fair",
};

function _mktParseVoiceText(text) {
    const t = text.toLowerCase();
    const result = { crop: "", qty: 0, price: 0, quality: "" };

    // Detect crop name (Hindi + English)
    for (const [key, value] of Object.entries(MKT_CROP_NAMES_MAP)) {
        if (t.includes(key)) { result.crop = value; break; }
    }

    // Detect quality
    for (const [key, value] of Object.entries(MKT_QUALITY_MAP)) {
        if (t.includes(key)) { result.quality = value; break; }
    }

    // Extract numbers — find patterns like "500 kg", "2000 rupees", "500 quintal"
    const nums = t.match(/(\d+\.?\d*)/g);
    if (nums) {
        const numContexts = [];
        nums.forEach(n => {
            const idx = t.indexOf(n);
            const after = t.substring(idx + n.length, idx + n.length + 25).trim();
            const before = t.substring(Math.max(0, idx - 25), idx).trim();
            numContexts.push({ val: parseFloat(n), after, before });
        });

        numContexts.forEach(nc => {
            const a = nc.after; const b = nc.before;
            if (a.match(/^(kg|kilo|किलो|kilogram)/) || b.match(/(quantity|qty|matra|मात्रा|weight)\s*$/)) {
                result.qty = nc.val;
            } else if (a.match(/^(quintal|क्विंटल|quint)/) || b.match(/(price|rate|daam|दाम|bhav|भाव|rupee|रुपय)\s*$/)) {
                result.price = nc.val;
            } else if (a.match(/^(rupee|rs|रुपय|₹|price|per)/) || b.match(/(price|rate|daam|दाम)\s*$/)) {
                result.price = nc.val;
            }
        });

        // Fallback: if we have numbers but couldn't assign context, use heuristics
        if (nums.length >= 2 && !result.qty && !result.price) {
            const sorted = nums.map(Number).sort((a, b) => a - b);
            result.qty = sorted[0]; // smaller = quantity
            result.price = sorted[sorted.length - 1]; // larger = price
        } else if (nums.length === 1 && !result.qty && !result.price) {
            const n = parseFloat(nums[0]);
            result.qty = n; // single number = probably qty
        }
    }

    return result;
}

function mktVoiceListing() {
    const sr = initSpeechRecognition();
    if (!sr) { toast(t('mktVoiceNotSupported'), "error"); return; }
    const btn = document.getElementById("mktVoiceSellBtn");
    if (btn) { btn.classList.add("mkt-voice-active"); btn.innerHTML = `<i class="fa-solid fa-microphone fa-beat"></i> ${t('mktListening')}`; }
    toast(`🎤 ${t('mktVoiceSpeakCrop')}`, "info", 4000);

    sr.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const parsed = _mktParseVoiceText(text);

        // Show what was heard
        const preview = document.getElementById("mktVoicePreview");
        if (preview) {
            preview.style.display = "block";
            preview.innerHTML = `<i class="fa-solid fa-microphone"></i> <em>"${text}"</em>
                ${parsed.crop ? `<span class="mkt-voice-tag">🌱 ${parsed.crop}</span>` : ""}
                ${parsed.qty ? `<span class="mkt-voice-tag">⚖️ ${parsed.qty} kg</span>` : ""}
                ${parsed.price ? `<span class="mkt-voice-tag">💰 ₹${parsed.price}/q</span>` : ""}
                ${parsed.quality ? `<span class="mkt-voice-tag">⭐ ${parsed.quality}</span>` : ""}`;
        }

        // Fill form fields
        if (parsed.crop) {
            const sel = document.getElementById("sellCrop");
            if (sel) { sel.value = parsed.crop; fetchAutoPrice(); }
        }
        if (parsed.qty) {
            const el = document.getElementById("sellQty");
            if (el) el.value = parsed.qty;
        }
        if (parsed.price) {
            const el = document.getElementById("sellPrice");
            if (el) el.value = parsed.price;
        }
        if (parsed.quality) {
            const el = document.getElementById("sellQuality");
            if (el) { el.value = parsed.quality; fetchAutoPrice(); }
        }

        const filled = [parsed.crop, parsed.qty, parsed.price].filter(Boolean).length;
        if (filled >= 2) {
            toast(`${t('mktVoiceFill')} ${filled} ${t('mktVoiceFilled')}`, "success");
        } else if (filled === 1) {
            toast(t('mktVoicePartial'), "info");
        } else {
            toast(t('mktVoiceFail'), "warning");
        }
    };
    sr.onerror = () => {
        if (btn) { btn.classList.remove("mkt-voice-active"); btn.innerHTML = `<i class="fa-solid fa-microphone"></i> ${t('mktSpeakList')}`; }
        toast(t('mktVoiceError'), "error");
    };
    sr.onend = () => {
        if (btn) { btn.classList.remove("mkt-voice-active"); btn.innerHTML = `<i class="fa-solid fa-microphone"></i> ${t('mktSpeakList')}`; }
    };
    sr.start();
}

function mktVoiceDemand() {
    const sr = initSpeechRecognition();
    if (!sr) { toast(t('mktVoiceNotSupported'), "error"); return; }
    const btn = document.getElementById("mktVoiceBuyBtn");
    if (btn) { btn.classList.add("mkt-voice-active"); btn.innerHTML = `<i class="fa-solid fa-microphone fa-beat"></i> ${t('mktListening')}`; }
    toast(`🎤 ${t('mktVoiceSpeakBuy')}`, "info", 4000);

    sr.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const parsed = _mktParseVoiceText(text);

        const preview = document.getElementById("mktVoicePreviewBuy");
        if (preview) {
            preview.style.display = "block";
            preview.innerHTML = `<i class="fa-solid fa-microphone"></i> <em>"${text}"</em>
                ${parsed.crop ? `<span class="mkt-voice-tag">🌱 ${parsed.crop}</span>` : ""}
                ${parsed.qty ? `<span class="mkt-voice-tag">⚖️ ${parsed.qty} kg</span>` : ""}
                ${parsed.price ? `<span class="mkt-voice-tag">💰 Max ₹${parsed.price}/q</span>` : ""}`;
        }

        if (parsed.crop) {
            const sel = document.getElementById("buyCrop");
            if (sel) sel.value = parsed.crop;
        }
        if (parsed.qty) {
            const el = document.getElementById("buyQty");
            if (el) el.value = parsed.qty;
        }
        if (parsed.price) {
            const el = document.getElementById("buyMaxPrice");
            if (el) el.value = parsed.price;
        }

        const filled = [parsed.crop, parsed.qty].filter(Boolean).length;
        if (filled >= 1) {
            toast(`${t('mktVoiceFill')} ${filled + (parsed.price ? 1 : 0)} ${t('mktVoiceFilled')}`, "success");
        } else {
            toast(t('mktVoiceFailBuy'), "warning");
        }
    };
    sr.onerror = () => {
        if (btn) { btn.classList.remove("mkt-voice-active"); btn.innerHTML = `<i class="fa-solid fa-microphone"></i> ${t('mktSpeakSearch')}`; }
        toast(t('mktVoiceError'), "error");
    };
    sr.onend = () => {
        if (btn) { btn.classList.remove("mkt-voice-active"); btn.innerHTML = `<i class="fa-solid fa-microphone"></i> ${t('mktSpeakSearch')}`; }
    };
    sr.start();
}

// ── Quick-sell: one-tap listing for popular crops ──
async function mktQuickSell(crop) {
    const dataEl = document.getElementById("mktPageData");
    const state = dataEl?.dataset.userState || "";
    const district = dataEl?.dataset.userDistrict || "";

    // Set form values and auto-submit
    document.getElementById("sellCrop").value = crop;
    document.getElementById("sellQuality").value = "standard";
    if (state) document.getElementById("sellState").value = state;
    if (district) document.getElementById("sellDistrict").value = district;
    fetchAutoPrice();
    toast(`${t('mktSelected')} ${crop} — ${t('mktFillQty')}`, "info");
    document.getElementById("sellQty").focus();
}

// ── Voice chat message ──
function mktVoiceChat() {
    const sr = initSpeechRecognition();
    if (!sr) { toast(t('mktVoiceNotSupported'), "error"); return; }
    const btn = document.getElementById("mktVoiceChatBtn");
    if (btn) btn.classList.add("mkt-voice-active");
    sr.onresult = (e) => {
        const text = e.results[0][0].transcript;
        document.getElementById("chatInput").value = text;
        document.getElementById("chatInput").focus();
    };
    sr.onend = () => { if (btn) btn.classList.remove("mkt-voice-active"); };
    sr.onerror = () => { if (btn) btn.classList.remove("mkt-voice-active"); };
    sr.start();
}

// ================================================================
//  MARKETPLACE: Photo Upload System
// ================================================================
let _mktPendingPhotos = [];  // Files to upload after listing is created
let _mktUploadedPhotos = []; // Already uploaded photos (edit mode)

function handlePhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (_mktPendingPhotos.length >= 3) {
        toast(t('mktMaxPhotos') || 'Max 3 photos allowed', 'error'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
        toast(t('mktPhotoTooBig') || 'Photo must be under 5 MB', 'error'); return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast(t('mktPhotoInvalidType') || 'Only JPG, PNG, WebP allowed', 'error'); return;
    }
    _mktPendingPhotos.push(file);
    renderPhotoPreview();
    e.target.value = '';
}

function renderPhotoPreview() {
    const grid = document.getElementById('photoPreviewGrid');
    const addBtn = document.getElementById('photoAddBtn');
    if (!grid) return;
    grid.innerHTML = _mktPendingPhotos.map((file, i) => {
        const url = URL.createObjectURL(file);
        return `<div class="mkt-photo-thumb">
            <img src="${url}" alt="Photo ${i+1}">
            <button type="button" class="mkt-photo-remove" onclick="removePhoto(${i})" title="Remove">&times;</button>
        </div>`;
    }).join('');
    if (addBtn) addBtn.style.display = _mktPendingPhotos.length >= 3 ? 'none' : '';
}

function removePhoto(index) {
    _mktPendingPhotos.splice(index, 1);
    renderPhotoPreview();
}

async function uploadPhotosForListing(listingId) {
    const results = [];
    for (const file of _mktPendingPhotos) {
        const fd = new FormData();
        fd.append('photo', file);
        try {
            const resp = await fetch(`/api/market/photo/${listingId}`, { method: 'POST', body: fd });
            const d = await resp.json();
            if (d.success) results.push(d.url);
        } catch { /* skip failed uploads */ }
    }
    _mktPendingPhotos = [];
    renderPhotoPreview();
    return results;
}

function renderListingPhotos(photos) {
    if (!photos || photos.length === 0) return '';
    const arr = typeof photos === 'string' ? JSON.parse(photos || '[]') : photos;
    if (arr.length === 0) return '';
    return `<div class="mkt-photo-gallery">
        ${arr.map(p => `<img src="/static/uploads/market/${p}" alt="Crop photo" class="mkt-gallery-img" onclick="openPhotoViewer('/static/uploads/market/${p}')" loading="lazy">`).join('')}
    </div>`;
}

function openPhotoViewer(src) {
    const existing = document.getElementById('mktPhotoViewer');
    if (existing) existing.remove();
    const viewer = document.createElement('div');
    viewer.id = 'mktPhotoViewer';
    viewer.className = 'mkt-photo-viewer';
    viewer.onclick = () => viewer.remove();
    viewer.innerHTML = `<img src="${src}" alt="Full photo"><button class="mkt-photo-viewer-close">&times;</button>`;
    document.body.appendChild(viewer);
}

// ================================================================
//  MARKETPLACE: Logistics / Delivery Arrangement
// ================================================================
let _mktLogisticsDealId = 0;

function openLogisticsModal(dealId, existingData) {
    _mktLogisticsDealId = dealId;
    document.getElementById('logDealId').value = dealId;
    const modal = document.getElementById('logisticsModal');
    // Pre-fill if existing data
    if (existingData) {
        const dt = existingData.delivery_type || 'pickup';
        selectDeliveryType(dt);
        document.querySelector(`input[name="deliveryType"][value="${dt}"]`).checked = true;
        document.getElementById('logPickupAddr').value = existingData.pickup_address || '';
        document.getElementById('logDeliveryAddr').value = existingData.delivery_address || '';
        document.getElementById('logTransportCost').value = existingData.transport_cost || 0;
    } else {
        selectDeliveryType('pickup');
        document.getElementById('logPickupAddr').value = '';
        document.getElementById('logDeliveryAddr').value = '';
        document.getElementById('logTransportCost').value = 0;
    }
    modal.style.display = 'flex';
}

function closeLogisticsModal() {
    document.getElementById('logisticsModal').style.display = 'none';
}

function selectDeliveryType(type) {
    document.querySelectorAll('.mkt-delivery-opt').forEach(el => el.classList.remove('active'));
    const radio = document.querySelector(`input[name="deliveryType"][value="${type}"]`);
    if (radio) {
        radio.checked = true;
        radio.closest('.mkt-delivery-opt').classList.add('active');
    }
    const delGroup = document.getElementById('logDeliveryAddrGroup');
    if (delGroup) delGroup.style.display = type === 'delivery' ? '' : 'none';
}

async function saveLogistics() {
    const dealId = _mktLogisticsDealId;
    const deliveryType = document.querySelector('input[name="deliveryType"]:checked')?.value || 'pickup';
    const pickupAddr = document.getElementById('logPickupAddr').value.trim();
    const deliveryAddr = document.getElementById('logDeliveryAddr').value.trim();
    const transportCost = parseFloat(document.getElementById('logTransportCost').value) || 0;
    try {
        await api(`/api/market/deal/${dealId}/logistics`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                delivery_type: deliveryType,
                pickup_address: pickupAddr,
                delivery_address: deliveryAddr,
                transport_cost: transportCost
            })
        });
        toast(t('mktLogisticsSaved') || 'Logistics saved!', 'success');
        closeLogisticsModal();
        loadBrowseTab();
    } catch (err) { toast(err.message, 'error'); }
}

// ================================================================
//  MARKETPLACE: Razorpay Payment
// ================================================================
let _mktPayDealId = 0;
let _mktPayDealData = null;

function openPaymentModal(dealId, dealData) {
    _mktPayDealId = dealId;
    _mktPayDealData = dealData;
    document.getElementById('payDealId').value = dealId;
    const summary = document.getElementById('paymentSummary');
    const transport = parseFloat(dealData.transport_cost || 0);
    const totalWithTransport = dealData.total_amount + transport;
    summary.innerHTML = `
        <div class="mkt-pay-row"><span>${t('mktCropLabel') || 'Crop'}</span><strong>${dealData.crop}</strong></div>
        <div class="mkt-pay-row"><span>${t('mktQuantity') || 'Quantity'}</span><strong>${dealData.qty_kg} kg</strong></div>
        <div class="mkt-pay-row"><span>${t('mktDealPriceL') || 'Deal Price'}</span><strong>₹${dealData.deal_price}/quintal</strong></div>
        <div class="mkt-pay-row"><span>${t('mktSubTotal') || 'Sub-Total'}</span><strong>₹${dealData.total_amount.toLocaleString('en-IN')}</strong></div>
        ${transport > 0 ? `<div class="mkt-pay-row"><span>${t('mktTransportCost') || 'Transport'}</span><strong>₹${transport.toLocaleString('en-IN')}</strong></div>` : ''}
        <div class="mkt-pay-row mkt-pay-total"><span>${t('mktPayTotal') || 'Total Payable'}</span><strong>₹${totalWithTransport.toLocaleString('en-IN')}</strong></div>
        ${dealData.payment_status === 'paid' ? `<div class="mkt-pay-done"><i class="fa-solid fa-circle-check"></i> ${t('mktAlreadyPaid') || 'Payment Completed'}</div>` : ''}
    `;
    const payBtn = document.getElementById('payNowBtn');
    if (payBtn) payBtn.style.display = dealData.payment_status === 'paid' ? 'none' : '';
    document.getElementById('paymentModal').style.display = 'flex';
}

function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
}

async function initiatePayment() {
    const dealId = _mktPayDealId;
    const btn = document.getElementById('payNowBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating order...'; }
    try {
        const d = await api('/api/market/payment/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deal_id: dealId })
        });
        // Open Razorpay checkout
        const options = {
            key: d.key_id,
            amount: d.amount,
            currency: d.currency,
            name: 'Kisan Salahkar',
            description: `Deal #${dealId} — ${d.deal.crop} (${d.deal.qty_kg}kg)`,
            order_id: d.order_id,
            prefill: {
                name: d.buyer_name,
                contact: d.buyer_phone,
            },
            theme: { color: '#059669' },
            handler: async function(response) {
                // Verify payment on server
                try {
                    await api('/api/market/payment/verify', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            deal_id: dealId
                        })
                    });
                    toast(t('mktPaymentSuccess') || 'Payment successful! Seller has been notified.', 'success');
                    closePaymentModal();
                    loadBrowseTab();
                } catch (err) {
                    toast(t('mktPaymentVerifyFail') || 'Payment verification failed. Contact support.', 'error');
                }
            },
            modal: {
                ondismiss: function() {
                    toast(t('mktPaymentCancelled') || 'Payment cancelled', 'info');
                }
            }
        };
        const rzp = new Razorpay(options);
        rzp.open();
    } catch (err) {
        toast(err.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-lock"></i> ${t('mktPayNow') || 'Pay Now via Razorpay'}`; }
}


// ─── Hook into page init ───
document.addEventListener("DOMContentLoaded", () => {
    initIoTDashboard();
    autoFillFromURLParams();

    // If on dashboard, try a silent sensor fetch for the mini-widget
    if (document.getElementById("sensorMiniWidget")) {
        fetch("/api/sensor/latest").then(r => r.json()).then(data => {
            if (data.success) updateDashboardWidget(data.reading);
        }).catch(() => {});
    }

    // Marketplace: load stats if on marketplace page
    if (document.getElementById("roleSelector")) {
        loadMarketStats();
    }

    // ── Auto-open chat from notification deep-link ──
    const _chatParams = new URLSearchParams(window.location.search);
    if (_chatParams.get("chat") === "1" && document.getElementById("chatModal")) {
        const _dlListingId = parseInt(_chatParams.get("listing_id")) || 0;
        const _dlPeerId = parseInt(_chatParams.get("peer_id")) || 0;
        const _dlPeerName = decodeURIComponent(_chatParams.get("peer_name") || "User");
        if (_dlPeerId) {
            // Small delay so marketplace UI can render
            setTimeout(() => openChat(_dlListingId, _dlPeerId, _dlPeerName), 600);
            // Clean URL without reload
            window.history.replaceState({}, "", "/marketplace");
        }
    }

    // ── Notification system ──
    initNotifications();
});


/* ================================================================
   NOTIFICATION SYSTEM — Bell, Panel, Polling, Toast Popups
   ================================================================ */

/** If link has chat deep-link params and we're on marketplace, open chat directly */
function _notifOpenChatOrNavigate(link) {
    if (!link) return;
    try {
        const url = new URL(link, window.location.origin);
        const isMarketplace = window.location.pathname === "/marketplace";
        if (url.searchParams.get("chat") === "1" && isMarketplace && typeof openChat === "function") {
            const lid = parseInt(url.searchParams.get("listing_id")) || 0;
            const pid = parseInt(url.searchParams.get("peer_id")) || 0;
            const pname = decodeURIComponent(url.searchParams.get("peer_name") || "User");
            if (pid) { openChat(lid, pid, pname); return; }
        }
    } catch (e) { /* fallback to navigate */ }
    window.location.href = link;
}
let _notifLastCount = 0;
let _notifPollTimer = null;
let _notifCache = [];

function initNotifications() {
    const bell = document.getElementById("notifBellBtn");
    const panel = document.getElementById("notifPanel");
    const overlay = document.getElementById("notifOverlay");
    const markAll = document.getElementById("notifMarkAll");
    if (!bell || !panel) return;

    // Toggle panel
    bell.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = panel.style.display !== "none";
        if (isOpen) {
            _closeNotifPanel();
        } else {
            panel.style.display = "flex";
            overlay.style.display = "block";
            _loadNotifications();
        }
    });

    // Close on overlay click
    overlay.addEventListener("click", _closeNotifPanel);

    // Mark all read
    markAll.addEventListener("click", async () => {
        await fetch("/api/notifications/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ all: true })
        });
        _updateBadge(0);
        document.querySelectorAll(".notif-item.unread").forEach(el => el.classList.remove("unread"));
    });

    // Initial count fetch + start polling
    _pollNotifCount();
    _notifPollTimer = setInterval(_pollNotifCount, 15000); // poll every 15s
}

function _closeNotifPanel() {
    const panel = document.getElementById("notifPanel");
    const overlay = document.getElementById("notifOverlay");
    if (panel) panel.style.display = "none";
    if (overlay) overlay.style.display = "none";
}

async function _pollNotifCount() {
    try {
        const r = await fetch("/api/notifications/count");
        const d = await r.json();
        if (!d.success) return;
        const newCount = d.unread || 0;
        // If new notifications arrived since last poll, show a toast popup
        if (newCount > _notifLastCount && _notifLastCount >= 0) {
            _fetchAndShowNewToast();
        }
        _notifLastCount = newCount;
        _updateBadge(newCount);
    } catch (e) { /* silent */ }
}

function _updateBadge(count) {
    const badge = document.getElementById("notifBadge");
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = "inline-block";
    } else {
        badge.style.display = "none";
    }
}

async function _fetchAndShowNewToast() {
    try {
        const r = await fetch("/api/notifications");
        const d = await r.json();
        if (!d.success || !d.notifications.length) return;
        // Show toast for the latest unread notification
        const latest = d.notifications.find(n => !n.is_read);
        if (latest) _showNotifToast(latest);
    } catch (e) { /* silent */ }
}

function _showNotifToast(notif) {
    // Remove existing toast
    document.querySelectorAll(".notif-toast").forEach(el => el.remove());

    const iconMap = {
        deal: "fa-handshake", offer: "fa-tag", message: "fa-comment-dots",
        match: "fa-arrows-rotate", forum: "fa-comments", info: "fa-circle-info"
    };
    const iconClass = iconMap[notif.type] || iconMap.info;

    const el = document.createElement("div");
    el.className = "notif-toast";
    el.innerHTML = `
        <div class="notif-icon ${notif.type}"><i class="fa-solid ${iconClass}"></i></div>
        <div class="notif-content">
            <div class="notif-title">${_escHtml(notif.title)}</div>
            <div class="notif-body">${_escHtml(notif.body)}</div>
        </div>
        <button class="notif-close" title="Dismiss">&times;</button>
    `;
    el.querySelector(".notif-close").addEventListener("click", (e) => {
        e.stopPropagation();
        el.remove();
    });
    el.addEventListener("click", () => {
        el.remove();
        if (notif.link) _notifOpenChatOrNavigate(notif.link);
        else document.getElementById("notifBellBtn")?.click();
    });
    document.body.appendChild(el);

    // Auto-dismiss after 6s
    setTimeout(() => { if (el.parentNode) el.remove(); }, 6000);

    // Play a subtle sound (if browser allows)
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880; gain.gain.value = 0.08;
        osc.start(); osc.stop(ctx.currentTime + 0.12);
    } catch(e) {}
}

async function _loadNotifications() {
    const list = document.getElementById("notifList");
    if (!list) return;
    list.innerHTML = '<div class="notif-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div>';
    try {
        const r = await fetch("/api/notifications");
        const d = await r.json();
        if (!d.success || !d.notifications.length) {
            list.innerHTML = '<div class="notif-empty"><i class="fa-solid fa-bell-slash"></i><p>No notifications yet</p></div>';
            return;
        }
        _notifCache = d.notifications;
        _updateBadge(d.unread);
        list.innerHTML = "";
        d.notifications.forEach(n => {
            list.appendChild(_createNotifItem(n));
        });
    } catch (e) {
        list.innerHTML = '<div class="notif-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load</p></div>';
    }
}

function _createNotifItem(n) {
    const iconMap = {
        deal: "fa-handshake", offer: "fa-tag", message: "fa-comment-dots",
        match: "fa-arrows-rotate", forum: "fa-comments", info: "fa-circle-info"
    };
    const iconClass = iconMap[n.type] || iconMap.info;
    const el = document.createElement("div");
    el.className = "notif-item" + (n.is_read ? "" : " unread");
    el.dataset.id = n.id;
    el.innerHTML = `
        <div class="notif-icon ${n.type}"><i class="fa-solid ${iconClass}"></i></div>
        <div class="notif-content">
            <div class="notif-title">${_escHtml(n.title)}</div>
            <div class="notif-body">${_escHtml(n.body)}</div>
            <div class="notif-time">${_timeAgo(n.created_at)}</div>
        </div>
    `;
    el.addEventListener("click", async () => {
        // Mark as read
        if (!n.is_read) {
            fetch("/api/notifications/read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [n.id] })
            });
            el.classList.remove("unread");
            n.is_read = 1;
            const badge = document.getElementById("notifBadge");
            if (badge) {
                const cur = parseInt(badge.textContent) || 0;
                _updateBadge(Math.max(0, cur - 1));
            }
        }
        // Navigate
        if (n.link) {
            _closeNotifPanel();
            _notifOpenChatOrNavigate(n.link);
        }
    });
    return el;
}

function _timeAgo(dateStr) {
    if (!dateStr) return "";
    const now = Date.now();
    const then = new Date(dateStr + (dateStr.includes("Z") || dateStr.includes("+") ? "" : " UTC")).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
    return new Date(then).toLocaleDateString();
}

function _escHtml(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
}


/* ================================================================
   1. DARK MODE TOGGLE
   ================================================================ */
function initDarkMode() {
    const btn = document.getElementById("darkToggle");
    if (!btn) return;
    // Restore saved preference
    const saved = localStorage.getItem("ks-theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.setAttribute("data-theme", "dark");
    }
    btn.addEventListener("click", () => {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        if (isDark) {
            document.documentElement.removeAttribute("data-theme");
            localStorage.setItem("ks-theme", "light");
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
            localStorage.setItem("ks-theme", "dark");
        }
    });
}


/* ================================================================
   4. SKELETON LOADING SCREENS
   ================================================================ */
function showSkeleton(containerId, count = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let html = '<div class="skeleton-grid">';
    for (let i = 0; i < count; i++) {
        html += `<div class="skeleton-card">
            <div class="skeleton skeleton-img"></div>
            <div class="skeleton skeleton-line w-75"></div>
            <div class="skeleton skeleton-line w-full"></div>
            <div class="skeleton skeleton-line w-50"></div>
            <div style="display:flex;gap:.6rem;margin-top:.6rem">
                <div class="skeleton skeleton-circle"></div>
                <div style="flex:1">
                    <div class="skeleton skeleton-line w-40"></div>
                    <div class="skeleton skeleton-line w-75"></div>
                </div>
            </div>
        </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function showSkeletonList(containerId, count = 4) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="skeleton-card" style="display:flex;gap:.8rem;align-items:center;margin-bottom:.5rem;">
            <div class="skeleton skeleton-circle"></div>
            <div style="flex:1">
                <div class="skeleton skeleton-line w-75"></div>
                <div class="skeleton skeleton-line w-50"></div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

function clearSkeleton(containerId) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
}


/* ================================================================
   5. SVG ANIMATED ILLUSTRATIONS (Empty States)
   ================================================================ */
const EMPTY_SVG = {
    noData: `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="80" fill="var(--primary-pale)" opacity=".5"/>
        <rect x="70" y="60" width="60" height="80" rx="6" fill="var(--card)" stroke="var(--border)" stroke-width="2"/>
        <line x1="82" y1="80" x2="118" y2="80" stroke="var(--border)" stroke-width="2" stroke-linecap="round"/>
        <line x1="82" y1="92" x2="110" y2="92" stroke="var(--border)" stroke-width="2" stroke-linecap="round"/>
        <line x1="82" y1="104" x2="105" y2="104" stroke="var(--border)" stroke-width="2" stroke-linecap="round"/>
        <circle cx="100" cy="120" r="4" fill="var(--text-light)" opacity=".4"/>
        <path d="M60 150 C60 150 80 130 100 140 C120 150 140 130 140 130" stroke="var(--primary-light)" stroke-width="2" fill="none" stroke-linecap="round" class="anim-leaf"/>
    </svg>`,
    noResults: `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="90" r="35" stroke="var(--primary)" stroke-width="3" fill="var(--primary-pale)" opacity=".6"/>
        <line x1="126" y1="116" x2="150" y2="140" stroke="var(--primary)" stroke-width="4" stroke-linecap="round"/>
        <path d="M88 88 L112 88" stroke="var(--text-light)" stroke-width="2" stroke-linecap="round"/>
        <path d="M50 160 C65 150 85 155 100 160 C115 165 135 155 150 160" stroke="var(--primary-light)" stroke-width="2" fill="none" class="anim-leaf"/>
    </svg>`,
    plant: `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="85" y="160" width="30" height="20" rx="4" fill="var(--accent)" opacity=".3"/>
        <path d="M100 160 C100 160 100 100 100 80" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/>
        <path d="M100 120 C80 105 65 110 65 110 C65 110 75 125 100 120" fill="var(--primary-light)" opacity=".7" class="anim-leaf"/>
        <path d="M100 100 C120 85 135 90 135 90 C135 90 125 105 100 100" fill="var(--primary)" opacity=".6" class="anim-leaf" style="animation-delay:.5s"/>
        <path d="M100 80 C85 65 70 70 70 70 C70 70 80 85 100 80" fill="var(--primary-light)" opacity=".5" class="anim-leaf" style="animation-delay:1s"/>
        <circle cx="100" cy="75" r="5" fill="var(--accent)" opacity=".8"/>
        <circle class="anim-drop" cx="78" cy="90" r="2" fill="var(--secondary-lt)" opacity=".6"/>
        <circle class="anim-drop" cx="122" cy="95" r="2" fill="var(--secondary-lt)" opacity=".6" style="animation-delay:.7s"/>
        <circle class="anim-sun" cx="155" cy="40" r="12" fill="var(--accent-light)" opacity=".4"/>
    </svg>`
};

function renderEmptyState(containerId, type = "noData", title = "No data found", msg = "") {
    const container = document.getElementById(containerId);
    if (!container) return;
    const svg = EMPTY_SVG[type] || EMPTY_SVG.noData;
    container.innerHTML = `<div class="empty-state-illustration">${svg}<h3>${_escHtml(title)}</h3>${msg ? `<p>${_escHtml(msg)}</p>` : ''}</div>`;
}


/* ================================================================
   7. ONBOARDING TOUR
   ================================================================ */
const TOUR_STEPS = [
    {
        el: ".nav-brand",
        title: "Welcome to Kisan Salahkar! 🌾",
        body: "Your AI-powered agriculture advisor. Let's take a quick tour of the key features.",
        icon: "👋"
    },
    {
        el: '[href="/crop"]',
        title: "Crop Advice",
        body: "Get AI recommendations for the best crops based on your soil, weather, and location.",
        icon: "🌱"
    },
    {
        el: '[href="/weather"]',
        title: "Weather Forecast",
        body: "Real-time weather updates and alerts to plan your farming activities.",
        icon: "⛅"
    },
    {
        el: '[href="/marketplace"]',
        title: "Marketplace",
        body: "Buy and sell crops directly. Chat with buyers and get the best prices.",
        icon: "🤝"
    },
    {
        el: "#searchTrigger",
        title: "Quick Search",
        body: "Press Ctrl+K anytime to search across crops, schemes, forum, and more!",
        icon: "🔍"
    },
    {
        el: "#darkToggle",
        title: "Dark Mode",
        body: "Switch between light and dark themes for comfortable viewing day or night.",
        icon: "🌙"
    }
];

let _tourStep = 0;
let _tourOverlay = null;

function initOnboarding() {
    // Only show on dashboard for first-time users
    if (window.location.pathname !== "/dashboard") return;
    if (localStorage.getItem("ks-tour-done")) return;

    // Small delay to let the page render
    setTimeout(startTour, 1200);
}

function startTour() {
    _tourStep = 0;
    _tourOverlay = document.createElement("div");
    _tourOverlay.className = "tour-overlay";
    _tourOverlay.id = "tourOverlay";
    document.body.appendChild(_tourOverlay);
    showTourStep();
}

function showTourStep() {
    if (_tourStep >= TOUR_STEPS.length) {
        endTour();
        return;
    }
    const step = TOUR_STEPS[_tourStep];
    const target = document.querySelector(step.el);

    // Remove previous tooltip
    document.querySelectorAll(".tour-tooltip, .tour-spotlight").forEach(e => e.remove());

    if (target) {
        const rect = target.getBoundingClientRect();
        const pad = 8;
        // Spotlight
        const spot = document.createElement("div");
        spot.className = "tour-spotlight";
        spot.style.cssText = `top:${rect.top - pad + window.scrollY}px;left:${rect.left - pad}px;width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px;`;
        document.body.appendChild(spot);
    }

    // Tooltip
    const tip = document.createElement("div");
    tip.className = "tour-tooltip";

    const dots = TOUR_STEPS.map((_, i) =>
        `<div class="tour-dot${i === _tourStep ? ' active' : ''}"></div>`
    ).join('');

    const isLast = _tourStep === TOUR_STEPS.length - 1;
    tip.innerHTML = `
        <div class="tour-step-icon">${step.icon}</div>
        <div class="tour-tooltip-title">${step.title}</div>
        <div class="tour-tooltip-body">${step.body}</div>
        <div class="tour-tooltip-footer">
            <div class="tour-dots">${dots}</div>
            <div style="display:flex;gap:.4rem;">
                <button class="tour-btn tour-btn-skip" onclick="endTour()">Skip</button>
                <button class="tour-btn ${isLast ? 'tour-btn-finish' : 'tour-btn-next'}" onclick="nextTourStep()">
                    ${isLast ? '✨ Get Started' : 'Next →'}
                </button>
            </div>
        </div>
    `;

    // Position tooltip below or beside the target
    if (target) {
        const rect = target.getBoundingClientRect();
        tip.style.top = (rect.bottom + 12 + window.scrollY) + "px";
        tip.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 360)) + "px";
    } else {
        tip.style.top = "30%";
        tip.style.left = "50%";
        tip.style.transform = "translateX(-50%)";
    }

    document.body.appendChild(tip);
}

function nextTourStep() {
    _tourStep++;
    showTourStep();
}

function endTour() {
    localStorage.setItem("ks-tour-done", "1");
    document.querySelectorAll(".tour-overlay, .tour-tooltip, .tour-spotlight").forEach(e => e.remove());
    _tourOverlay = null;
}


/* ================================================================
   11. GLOBAL SEARCH BAR
   ================================================================ */
let _searchFocusIdx = -1;
let _searchDebounce = null;

function initGlobalSearch() {
    const trigger = document.getElementById("searchTrigger");
    const overlay = document.getElementById("searchOverlay");
    const input = document.getElementById("searchInput");
    const results = document.getElementById("searchResults");
    if (!trigger || !overlay || !input) return;

    // Open search
    function openSearch() {
        overlay.style.display = "flex";
        requestAnimationFrame(() => overlay.classList.add("visible"));
        input.value = "";
        results.innerHTML = "";
        _searchFocusIdx = -1;
        input.focus();
    }
    function closeSearch() {
        overlay.classList.remove("visible");
        setTimeout(() => { overlay.style.display = "none"; }, 250);
    }

    trigger.addEventListener("click", openSearch);

    // Ctrl+K / Cmd+K shortcut
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
            e.preventDefault();
            if (overlay.style.display === "flex") closeSearch();
            else openSearch();
        }
    });

    // Close on overlay click or Escape
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeSearch();
    });
    overlay.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeSearch();
    });

    // Keyboard navigation
    input.addEventListener("keydown", (e) => {
        const items = results.querySelectorAll(".search-result-item");
        if (e.key === "ArrowDown") {
            e.preventDefault();
            _searchFocusIdx = Math.min(_searchFocusIdx + 1, items.length - 1);
            _highlightSearchItem(items);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            _searchFocusIdx = Math.max(_searchFocusIdx - 1, 0);
            _highlightSearchItem(items);
        } else if (e.key === "Enter" && _searchFocusIdx >= 0 && items[_searchFocusIdx]) {
            e.preventDefault();
            items[_searchFocusIdx].click();
        }
    });

    // Live search with debounce
    input.addEventListener("input", () => {
        clearTimeout(_searchDebounce);
        const q = input.value.trim();
        if (q.length < 2) { results.innerHTML = ""; _searchFocusIdx = -1; return; }
        _searchDebounce = setTimeout(() => _performSearch(q, results, closeSearch), 250);
    });
}

function _highlightSearchItem(items) {
    items.forEach((it, i) => {
        it.classList.toggle("focused", i === _searchFocusIdx);
        if (i === _searchFocusIdx) it.scrollIntoView({ block: "nearest" });
    });
}

async function _performSearch(q, resultsEl, closeFn) {
    try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        if (!d.success || !d.results.length) {
            resultsEl.innerHTML = `<div class="search-empty"><i class="fa-solid fa-magnifying-glass"></i><p>No results for "${_escHtml(q)}"</p></div>`;
            _searchFocusIdx = -1;
            return;
        }
        const typeIcons = { page: "file-lines", crop: "seedling", scheme: "landmark", market: "handshake", forum: "comments" };
        resultsEl.innerHTML = d.results.map((r, i) => {
            const icon = r.icon || typeIcons[r.type] || "circle";
            const typeCls = r.type || "page";
            return `<a class="search-result-item" href="${_escHtml(r.url)}" data-idx="${i}">
                <div class="search-result-icon ${typeCls}"><i class="fa-solid fa-${icon}"></i></div>
                <div class="search-result-text">
                    <div class="search-result-title">${_escHtml(r.title)}</div>
                    ${r.sub ? `<div class="search-result-sub">${_escHtml(r.sub)}</div>` : ''}
                </div>
            </a>`;
        }).join('');
        _searchFocusIdx = -1;
        // Click handler
        resultsEl.querySelectorAll(".search-result-item").forEach(item => {
            item.addEventListener("click", () => closeFn());
        });
    } catch (e) {
        resultsEl.innerHTML = '<div class="search-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Search failed</p></div>';
    }
}


/* ================================================================
   INIT ALL NEW FEATURES
   ================================================================ */
document.addEventListener("DOMContentLoaded", () => {
    initDarkMode();
    initGlobalSearch();
    initOnboarding();
});
