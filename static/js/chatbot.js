/**
 * Kisan Salahkar — AI Chatbot Widget
 * Floating chat bubble with expandable chat panel + auto voice + persistent history.
 */
const KrishiChat = (() => {
    let chatOpen = false;
    let history = [];          // [{role:"user"|"bot", text:"..."}]
    let isTyping = false;
    let recognition = null;    // SpeechRecognition instance
    let isSpeaking = false;
    let currentUtterance = null;
    const HISTORY_KEY = "ks_chat_history";
    const MAX_HISTORY = 50;    // keep last 50 messages in localStorage

    // ── Persist / restore chat history ──
    function saveHistory() {
        try {
            const trimmed = history.slice(-MAX_HISTORY);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
        } catch (_) {}
    }
    function loadHistory() {
        try {
            const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
            if (Array.isArray(saved)) history = saved.slice(-MAX_HISTORY);
        } catch (_) {}
    }

    function getCurrentPage() {
        const path = window.location.pathname;
        const map = {
            "/": "Home / Dashboard",
            "/dashboard": "Home / Dashboard",
            "/crop": "Crop Advice",
            "/weather": "Weather Forecast",
            "/mandi": "Mandi Bhav (Market Prices)",
            "/disease": "Disease Detection",
            "/soil": "Soil Analysis",
            "/schemes": "Government Schemes",
            "/iot": "IoT Sensor Dashboard",
            "/forum": "Kisan Forum",
            "/alerts": "Alerts & Notifications",
        };
        return map[path] || path;
    }

    // ── Quick-suggest buttons (concise) ──
    const QUICK_QUESTIONS = [
        { label: "🌾 Fasal Advice", text: "Meri zameen ke liye kaunsi fasal best hai?" },
        { label: "🧪 Khad Guide", text: "Meri fasal ke liye kaun si khad daalein, kitni?" },
        { label: "🐛 Rog / Keet", text: "Meri fasal mein rog lag gaya — kya karein?" },
        { label: "🌦️ Mausam Tips", text: "Aaj ka mausam farming ke liye kaisa hai?" },
        { label: "📊 Mandi Bhav", text: "Meri fasal ka aaj ka mandi bhav kya hai?" },
        { label: "🏛️ Sarkari Yojnayein", text: "Mere liye kaun si sarkari scheme apply hoti hai?" },
    ];

    // ── Smart action buttons — fetch real data from APIs ──
    const SMART_ACTIONS = [
        { label: "🌦️ Live Mausam", action: "weather", icon: "🌦️" },
        { label: "📡 Sensor Data", action: "sensor", icon: "📡" },
        { label: "📊 Mandi Price", action: "mandi", icon: "📊" },
        { label: "🌅 Daily Briefing", action: "briefing", icon: "🌅" },
    ];

    // ── Build DOM ──
    function init() {
        if (document.getElementById("krishi-chat-bubble")) return;

        // Floating label + bubble container
        const wrap = el("div", { id: "kc-float-wrap" });
        const label = el("div", { id: "kc-float-label" });
        label.innerHTML = `<span>🌾 Kisan Salahkar</span><small>AI Assistant se poochho!</small>`;
        label.onclick = toggleChat;

        const bubble = el("div", { id: "krishi-chat-bubble", title: "Kisan Salahkar — AI se baat karein" });
        bubble.innerHTML = `<img src="/static/images/chatbot-avatar.png" alt="Kisan Salahkar" class="kc-bubble-img">`;
        bubble.onclick = toggleChat;

        wrap.appendChild(label);
        wrap.appendChild(bubble);

        // Panel
        const panel = el("div", { id: "krishi-chat-panel", class: "kc-hidden" });
        panel.innerHTML = `
            <div class="kc-header">
                <div class="kc-header-left">
                    <img src="/static/images/chatbot-avatar.png" alt="AI" class="kc-header-avatar">
                    <div>
                        <div class="kc-title">Kisan Salahkar</div>
                        <div class="kc-subtitle" id="kc-status">AI Krishi Advisor ✨</div>
                    </div>
                </div>
                <div class="kc-header-right">
                    <button id="kc-clear-btn" class="kc-icon-btn" title="Clear chat">🗑️</button>
                    <button id="kc-close-btn" class="kc-icon-btn" title="Close">✕</button>
                </div>
            </div>
            <div class="kc-messages" id="kc-messages"></div>
            <div class="kc-quick" id="kc-quick"></div>
            <div class="kc-input-row">
                <button id="kc-mic-btn" class="kc-icon-btn" title="Voice input">🎤</button>
                <input id="kc-input" type="text" placeholder="Apna sawaal poochho..." maxlength="1000" autocomplete="off"/>
                <button id="kc-send-btn" class="kc-icon-btn" title="Send">➤</button>
            </div>
        `;

        document.body.appendChild(wrap);
        document.body.appendChild(panel);

        // Events
        document.getElementById("kc-close-btn").onclick = toggleChat;
        document.getElementById("kc-clear-btn").onclick = clearChat;
        document.getElementById("kc-send-btn").onclick = sendMessage;
        document.getElementById("kc-input").addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        document.getElementById("kc-mic-btn").onclick = toggleVoice;

        // Restore previous history
        loadHistory();
        if (history.length > 0) {
            // Re-render saved messages (no auto-speak)
            history.forEach(h => appendBubble(h.role, h.text, false));
            document.getElementById("kc-quick").style.display = "none";
        } else {
            addBotMessage("🙏 Namaste! Main **Kisan Salahkar** hoon — aapka AI farming advisor.\n\nKoi bhi sawaal poochho — fasal, khad, rog, mausam, mandi, yojnayein! 🌾", false);
        }
        renderQuickButtons();

        // Preload TTS voices (Chrome loads them async)
        if (window.speechSynthesis) {
            speechSynthesis.getVoices();
            speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
        }

        // Auto-hide floating label after 6 seconds
        setTimeout(() => { if (!chatOpen) label.classList.add("kc-label-hide"); }, 6000);
    }

    // ── Helpers ──
    function el(tag, attrs) {
        const e = document.createElement(tag);
        if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
        return e;
    }

    function clearChat() {
        history = [];
        saveHistory();
        document.getElementById("kc-messages").innerHTML = "";
        document.getElementById("kc-quick").style.display = "";
        renderQuickButtons();
        addBotMessage("🙏 Chat cleared! Naya sawaal poochho.", false);
    }

    function toggleChat() {
        const panel = document.getElementById("krishi-chat-panel");
        const bubble = document.getElementById("krishi-chat-bubble");
        const label = document.getElementById("kc-float-label");
        chatOpen = !chatOpen;
        if (chatOpen) {
            panel.classList.remove("kc-hidden");
            bubble.classList.add("kc-open");
            if (label) label.classList.add("kc-label-hide");
            document.getElementById("kc-input").focus();
            // Scroll to bottom
            const box = document.getElementById("kc-messages");
            box.scrollTop = box.scrollHeight;
        } else {
            panel.classList.add("kc-hidden");
            bubble.classList.remove("kc-open");
            stopSpeaking();
        }
    }

    // ── Quick buttons ──
    function renderQuickButtons() {
        const box = document.getElementById("kc-quick");
        box.innerHTML = "";

        // Smart action row
        const actionRow = el("div", { class: "kc-action-row" });
        SMART_ACTIONS.forEach(a => {
            const btn = el("button", { class: "kc-action-btn" });
            btn.textContent = a.label;
            btn.onclick = () => executeSmartAction(a.action);
            actionRow.appendChild(btn);
        });
        box.appendChild(actionRow);

        // Quick question row
        const qRow = el("div", { class: "kc-quick-row" });
        QUICK_QUESTIONS.forEach(q => {
            const btn = el("button", { class: "kc-quick-btn" });
            btn.textContent = q.label;
            btn.onclick = () => {
                document.getElementById("kc-input").value = q.text;
                sendMessage();
            };
            qRow.appendChild(btn);
        });
        box.appendChild(qRow);
    }

    // ── Smart Action Execution ──
    async function executeSmartAction(action) {
        const statusEl = document.getElementById("kc-status");
        const origStatus = statusEl.textContent;
        statusEl.textContent = "⏳ Fetching data...";
        document.getElementById("kc-quick").style.display = "none";

        let params = {};
        if (action === "weather") {
            // Try to get user's city from profile or ask
            const city = window._ksUserCity || "Delhi";
            params.city = city;
            addUserMessage(`🌦️ Live mausam batao — ${city}`);
        } else if (action === "mandi") {
            const crop = window._ksUserCrop || "wheat";
            params.crop = crop;
            addUserMessage(`📊 ${crop} ka mandi bhav batao`);
        } else if (action === "sensor") {
            addUserMessage("📡 Sensor ka live data dikhao");
        } else if (action === "briefing") {
            addUserMessage("🌅 Mera daily farm briefing generate karo");
        }

        showTyping();

        try {
            let res, data;
            if (action === "briefing") {
                res = await fetch("/api/briefing/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        city: window._ksUserCity || "",
                        crops: window._ksUserCrop || "",
                        force: false
                    }),
                });
                data = await res.json();
                hideTyping();
                if (data.success && data.briefing) {
                    addBotMessage(data.briefing, true);
                } else {
                    addBotMessage("⚠️ Briefing generate nahi ho paya. Please login karein aur city set karein.", false);
                }
            } else {
                res = await fetch("/api/chat/action", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, params }),
                });
                data = await res.json();
                hideTyping();
                if (data.success && data.summary) {
                    addBotMessage(data.summary, true);
                    // Follow up with Gemini analysis
                    if (data.data && action !== "briefing") {
                        const followUp = `Based on this ${action} data: ${JSON.stringify(data.data)} — give me 2-3 specific farming tips in Hinglish.`;
                        document.getElementById("kc-input").value = followUp;
                        sendMessage();
                    }
                } else {
                    addBotMessage(`⚠️ ${action} data fetch nahi ho paya: ${data.error || "Unknown error"}`, false);
                }
            }
        } catch (err) {
            hideTyping();
            addBotMessage("⚠️ Network error — server se connection nahi ho paya.", false);
        }

        statusEl.textContent = origStatus;
    }

    // ── Voice output (Text-to-Speech) — fast phrase-level queue ──
    let speechQueue = [];
    let isSpeakingQueue = false;
    let _keepAliveTimer = null;

    function cleanForSpeech(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[#*_~`>|]/g, '')
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}•→←↗✨✅⚠️]/gu, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    /** Queue a phrase for speech — starts immediately if idle */
    function queueSpeech(phrase) {
        if (!window.speechSynthesis) return;
        const clean = cleanForSpeech(phrase);
        if (!clean || clean.length < 2) return;
        speechQueue.push(clean);
        if (!isSpeakingQueue) _speakNext();
    }

    function _speakNext() {
        if (speechQueue.length === 0) {
            isSpeakingQueue = false;
            isSpeaking = false;
            currentUtterance = null;
            _stopKeepAlive();
            updateSpeakButtons(false);
            return;
        }
        isSpeakingQueue = true;
        isSpeaking = true;
        updateSpeakButtons(true);

        const text = speechQueue.shift();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'hi-IN';
        utter.rate = 1.05;
        utter.pitch = 1.0;
        utter.volume = 1.0;

        const voices = speechSynthesis.getVoices();
        const hv = voices.find(v => v.lang === 'hi-IN') || voices.find(v => v.lang.startsWith('hi'));
        if (hv) utter.voice = hv;

        currentUtterance = utter;
        utter.onend = () => _speakNext();
        utter.onerror = () => _speakNext();

        speechSynthesis.speak(utter);
        _startKeepAlive();
    }

    // Chrome bug workaround: pause/resume every 5s to prevent TTS from freezing
    function _startKeepAlive() {
        _stopKeepAlive();
        _keepAliveTimer = setInterval(() => {
            if (speechSynthesis.speaking && !speechSynthesis.paused) {
                speechSynthesis.pause();
                speechSynthesis.resume();
            }
        }, 5000);
    }
    function _stopKeepAlive() {
        if (_keepAliveTimer) { clearInterval(_keepAliveTimer); _keepAliveTimer = null; }
    }

    /** Speak full text at once (for replay button) */
    function speakText(text) {
        if (!window.speechSynthesis) return;
        stopSpeaking();
        // Split on sentence/phrase boundaries for fast playback
        const phrases = cleanForSpeech(text)
            .split(/(?<=[।.!?\n:—\-])\s*/)
            .map(s => s.trim())
            .filter(s => s.length > 2);
        phrases.forEach(p => queueSpeech(p));
    }

    function stopSpeaking() {
        speechQueue = [];
        isSpeakingQueue = false;
        if (window.speechSynthesis) speechSynthesis.cancel();
        isSpeaking = false;
        currentUtterance = null;
        _stopKeepAlive();
        updateSpeakButtons(false);
    }

    function updateSpeakButtons(speaking) {
        document.querySelectorAll('.kc-speak-btn').forEach(btn => {
            btn.textContent = speaking ? '⏹️' : '🔊';
            btn.title = speaking ? 'Stop speaking' : 'Sunein (Listen)';
            btn.classList.toggle('kc-speaking-active', speaking);
        });
    }

    // ── Messages ──
    function addBotMessage(text, autoSpeak = true) {
        history.push({ role: "bot", text });
        saveHistory();
        appendBubble("bot", text, autoSpeak);
    }

    function addUserMessage(text) {
        history.push({ role: "user", text });
        saveHistory();
        appendBubble("user", text, false);
    }

    function appendBubble(role, text, withSpeak = false) {
        const box = document.getElementById("kc-messages");
        const wrap = el("div", { class: `kc-msg kc-${role}` });
        let html = `<div class="kc-bubble">${formatMarkdown(text)}</div>`;
        if (role === 'bot') {
            html += `<button class="kc-speak-btn" title="Sunein (Listen)">🔊</button>`;
        }
        wrap.innerHTML = html;

        // Attach speak button listener
        const speakBtn = wrap.querySelector('.kc-speak-btn');
        if (speakBtn) {
            speakBtn.onclick = () => {
                if (isSpeaking) { stopSpeaking(); }
                else { speakText(text); }
            };
        }

        box.appendChild(wrap);
        box.scrollTop = box.scrollHeight;

        // Auto-speak bot replies
        if (withSpeak && role === 'bot') {
            speakText(text);
        }
    }

    function formatMarkdown(text) {
        // Simple markdown: bold, links, newlines
        return text
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
            .replace(/\n/g, "<br>");
    }

    function showTyping() {
        if (isTyping) return;
        isTyping = true;
        const box = document.getElementById("kc-messages");
        const wrap = el("div", { class: "kc-msg kc-bot", id: "kc-typing" });
        wrap.innerHTML = `<div class="kc-bubble kc-typing-dots"><span></span><span></span><span></span></div>`;
        box.appendChild(wrap);
        box.scrollTop = box.scrollHeight;
    }

    function hideTyping() {
        isTyping = false;
        const t = document.getElementById("kc-typing");
        if (t) t.remove();
    }

    // ── Send (streaming) ──
    async function sendMessage() {
        const input = document.getElementById("kc-input");
        const msg = input.value.trim();
        if (!msg || isTyping) return;
        input.value = "";
        stopSpeaking();
        addUserMessage(msg);
        document.getElementById("kc-quick").style.display = "none";

        showTyping();

        try {
            const apiHistory = history
                .filter(h => h.role === "user" || h.role === "bot")
                .map(h => ({ role: h.role === "user" ? "user" : "model", text: h.text }));

            const res = await fetch("/api/chat/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: msg,
                    history: apiHistory.slice(0, -1),
                    page: getCurrentPage(),
                }),
            });

            hideTyping();

            if (!res.ok) {
                addBotMessage("⚠️ Server error — try again.", false);
                return;
            }

            // Create a live bubble for streaming text
            const box = document.getElementById("kc-messages");
            const wrap = el("div", { class: "kc-msg kc-bot" });
            wrap.innerHTML = `<div class="kc-bubble kc-live-bubble"></div><button class="kc-speak-btn" title="Sunein (Listen)">🔊</button>`;
            box.appendChild(wrap);

            const liveBubble = wrap.querySelector(".kc-live-bubble");
            let fullText = "";
            let spokenPos = 0;  // character position up to which we've queued speech

            // Regex for phrase boundaries — speak as soon as a phrase ends
            const PHRASE_END = /[।.!?\n:—\-]\s*/g;

            // Read SSE stream
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                sseBuffer += decoder.decode(value, { stream: true });

                const lines = sseBuffer.split("\n");
                sseBuffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const payload = JSON.parse(line.slice(6));
                        if (payload.chunk) {
                            fullText += payload.chunk;
                            liveBubble.innerHTML = formatMarkdown(fullText);
                            box.scrollTop = box.scrollHeight;

                            // Queue any new complete phrases for speech
                            const unspoken = fullText.substring(spokenPos);
                            let lastBoundary = -1;
                            PHRASE_END.lastIndex = 0;
                            let m;
                            while ((m = PHRASE_END.exec(unspoken)) !== null) {
                                lastBoundary = m.index + m[0].length;
                            }
                            if (lastBoundary > 0) {
                                const newPhrase = unspoken.substring(0, lastBoundary);
                                queueSpeech(newPhrase);
                                spokenPos += lastBoundary;
                            }
                        }
                        if (payload.done) {
                            // Speak any leftover text after last boundary
                            const remaining = fullText.substring(spokenPos).trim();
                            if (remaining.length > 2) queueSpeech(remaining);
                            spokenPos = fullText.length;
                        }
                    } catch (_) {}
                }
            }

            // Store in history
            history.push({ role: "bot", text: fullText });
            saveHistory();

            // Wire up replay speak button
            const speakBtn = wrap.querySelector('.kc-speak-btn');
            if (speakBtn) {
                speakBtn.onclick = () => {
                    if (isSpeaking) { stopSpeaking(); }
                    else { speakText(fullText); }
                };
            }

        } catch (err) {
            hideTyping();
            addBotMessage("⚠️ Network error — server se connection nahi ho paya.", false);
        }
    }

    // ── Voice Input ──
    function toggleVoice() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addBotMessage("⚠️ Aapke browser mein voice input support nahi hai.");
            return;
        }
        const micBtn = document.getElementById("kc-mic-btn");
        if (recognition) {
            recognition.stop();
            recognition = null;
            micBtn.classList.remove("kc-mic-active");
            return;
        }
        recognition = new SpeechRecognition();
        recognition.lang = "hi-IN";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        micBtn.classList.add("kc-mic-active");

        recognition.onresult = (e) => {
            const text = e.results[0][0].transcript;
            document.getElementById("kc-input").value = text;
            sendMessage();
        };
        recognition.onerror = () => {
            micBtn.classList.remove("kc-mic-active");
            recognition = null;
        };
        recognition.onend = () => {
            micBtn.classList.remove("kc-mic-active");
            recognition = null;
        };
        recognition.start();
    }

    // ── Public API ──
    return { init };
})();

// Auto-init on DOM ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", KrishiChat.init);
} else {
    KrishiChat.init();
}
