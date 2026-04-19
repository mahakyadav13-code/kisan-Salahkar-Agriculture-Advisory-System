/* ================================================================
   voice-advisor.js — Human-like Voice Explanations for Every Feature
   Kisan Salahkar Agriculture Advisory System
   ================================================================
   Generates natural-language explanations in Hindi & English,
   then speaks them using the Web Speech API (SpeechSynthesis).
   ================================================================ */

const VoiceAdvisor = (() => {
    let _speaking = false;
    let _currentBtn = null;

    const isHi = () => (typeof LangManager !== "undefined" ? LangManager.current : localStorage.getItem("lang") || "en") === "hi";

    // ── Core TTS Engine ──────────────────────────────────────────
    function speak(text, btn) {
        if (!window.speechSynthesis) return;
        // If already speaking, stop
        if (_speaking) { stop(); return; }

        window.speechSynthesis.cancel();
        const chunks = splitIntoChunks(text, 180);
        _speaking = true;
        _currentBtn = btn;
        if (btn) btn.classList.add("va-speaking");

        let idx = 0;
        function speakNext() {
            if (idx >= chunks.length || !_speaking) {
                _speaking = false;
                if (_currentBtn) _currentBtn.classList.remove("va-speaking");
                return;
            }
            const u = new SpeechSynthesisUtterance(chunks[idx]);
            u.lang = isHi() ? "hi-IN" : "en-IN";
            u.rate = 0.92;
            u.pitch = 1.0;
            u.onend = () => { idx++; speakNext(); };
            u.onerror = () => { _speaking = false; if (_currentBtn) _currentBtn.classList.remove("va-speaking"); };
            window.speechSynthesis.speak(u);
        }
        speakNext();
    }

    function stop() {
        window.speechSynthesis.cancel();
        _speaking = false;
        if (_currentBtn) _currentBtn.classList.remove("va-speaking");
    }

    function splitIntoChunks(text, maxLen) {
        const sentences = text.replace(/\.\s+/g, ".|").replace(/।\s*/g, "।|").split("|").filter(Boolean);
        const chunks = [];
        let current = "";
        for (const s of sentences) {
            if ((current + s).length > maxLen && current) {
                chunks.push(current.trim());
                current = s;
            } else {
                current += " " + s;
            }
        }
        if (current.trim()) chunks.push(current.trim());
        return chunks.length ? chunks : [text];
    }

    // ── Universal speaker button creator ─────────────────────────
    function createSpeakButton(containerId, generator, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        // Remove old button if exists
        const old = container.querySelector(".va-speak-btn");
        if (old) old.remove();

        const btn = document.createElement("button");
        btn.className = "btn btn-voice-sm va-speak-btn";
        btn.type = "button";
        btn.title = isHi() ? "सुनें" : "Listen to explanation";
        btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> <span>${isHi() ? "विस्तार से सुनें" : "Listen"}</span>`;
        btn.addEventListener("click", () => {
            const text = generator(data);
            speak(text, btn);
        });
        container.prepend(btn);
    }

    // ════════════════════════════════════════════════════════════
    //  CROP RECOMMENDATION — Rich explanation
    // ════════════════════════════════════════════════════════════
    function explainCrop(data) {
        const { predictions, moisture_advisory, input_used } = data;
        if (!predictions || !predictions.length) return isHi() ? "कोई फसल सिफारिश उपलब्ध नहीं है।" : "No crop recommendation available.";

        const top = predictions[0];
        const others = predictions.slice(1, 4);

        if (isHi()) {
            let text = `नमस्ते किसान भाई! आपकी मिट्टी और मौसम की जानकारी के आधार पर, मैंने विश्लेषण किया है। `;
            text += `आपके खेत के लिए सबसे अच्छी फसल ${top.crop} है, जिसमें ${top.confidence} प्रतिशत विश्वास है। `;

            if (input_used) {
                text += `आपकी मिट्टी में नाइट्रोजन ${input_used.N || "अज्ञात"}, फॉस्फोरस ${input_used.P || "अज्ञात"}, और पोटैशियम ${input_used.K || "अज्ञात"} है। `;
                text += `तापमान ${input_used.temperature || "अज्ञात"} डिग्री, नमी ${input_used.humidity || "अज्ञात"} प्रतिशत, pH ${input_used.pH || "अज्ञात"}, और बारिश ${input_used.rainfall || "अज्ञात"} मिलीमीटर है। `;
                text += `इन सभी स्थितियों को देखते हुए ${top.crop} सबसे उपयुक्त है। `;
            }

            if (top.seasons && top.seasons.length) {
                const seasonNames = { kharif: "खरीफ़", rabi: "रबी", zaid: "ज़ायद" };
                text += `यह फसल ${top.seasons.map(s => seasonNames[s] || s).join(" और ")} सीज़न में उगाई जाती है। `;
            }

            if (top.msp) {
                text += `सरकार द्वारा निर्धारित न्यूनतम समर्थन मूल्य ${top.msp} रुपये प्रति क्विंटल है। `;
            }

            if (top.tip_hi || top.tip) {
                text += `खेती की सलाह: ${top.tip_hi || top.tip}। `;
            }

            if (top.diseases && top.diseases.length) {
                text += `ध्यान रखें, इस फसल में ${top.diseases.join(", ")} जैसी बीमारियाँ हो सकती हैं। समय-समय पर फसल की जाँच करें। `;
            }

            if (moisture_advisory) {
                text += moisture_advisory.msg_hi || moisture_advisory.msg || "";
                text += "। ";
            }

            if (others.length) {
                text += `अन्य विकल्पों में `;
                text += others.map(p => `${p.crop} जो ${p.confidence} प्रतिशत उपयुक्त है`).join(", ");
                text += ` शामिल हैं। `;
            }

            text += `यदि आपके कोई सवाल हैं तो आप हमारे फोरम पर पूछ सकते हैं। खुशहाल खेती!`;
            return text;
        } else {
            let text = `Hello farmer! Based on your soil and weather data, I've analyzed the best crop for your field. `;
            text += `The top recommendation is ${top.crop} with ${top.confidence} percent confidence. `;

            if (input_used) {
                text += `Your soil has Nitrogen ${input_used.N || "unknown"}, Phosphorus ${input_used.P || "unknown"}, and Potassium ${input_used.K || "unknown"}. `;
                text += `Temperature is ${input_used.temperature || "unknown"} degrees, humidity ${input_used.humidity || "unknown"} percent, pH ${input_used.pH || "unknown"}, and rainfall ${input_used.rainfall || "unknown"} millimeters. `;
                text += `Considering all these conditions, ${top.crop} is the most suitable crop. `;
            }

            if (top.seasons && top.seasons.length) {
                text += `This crop grows best in the ${top.seasons.join(" and ")} season. `;
            }

            if (top.msp) {
                text += `The government Minimum Support Price is ${top.msp} rupees per quintal, which guarantees you a fair price. `;
            }

            if (top.tip) {
                text += `Growing tip: ${top.tip}. `;
            }

            if (top.diseases && top.diseases.length) {
                text += `Be careful, this crop can be affected by ${top.diseases.join(", ")}. Monitor your crop regularly and take preventive measures. `;
            }

            if (moisture_advisory) {
                text += (moisture_advisory.msg || "") + ". ";
            }

            if (others.length) {
                text += `Other good options include `;
                text += others.map(p => `${p.crop} at ${p.confidence} percent`).join(", ");
                text += `. `;
            }

            text += `If you have any questions, feel free to ask on our community forum. Happy farming!`;
            return text;
        }
    }

    // ════════════════════════════════════════════════════════════
    //  WEATHER — Rich explanation
    // ════════════════════════════════════════════════════════════
    function explainWeather(data) {
        const c = data.current;
        const city = data.city;
        const forecast = data.forecast || [];
        const advisory = data.advisory || [];

        if (isHi()) {
            let text = `${city} का आज का मौसम इस प्रकार है। `;
            text += `अभी तापमान ${c.temp} डिग्री सेल्सियस है और महसूस हो रहा है ${c.feelsLike} डिग्री। `;
            text += `मौसम ${c.desc} है। `;
            text += `हवा में नमी ${c.humidity} प्रतिशत है, हवा की रफ्तार ${c.windSpeed} किलोमीटर प्रति घंटा ${c.windDir} दिशा में है। `;

            if (parseInt(c.temp) > 38) {
                text += `तापमान बहुत ज़्यादा है। अपने फसलों को ज़्यादा पानी दें और दोपहर में खेत में काम करने से बचें। `;
            } else if (parseInt(c.temp) < 10) {
                text += `तापमान कम है। ठंड-संवेदनशील फसलों को ढकें। `;
            }

            if (parseInt(c.humidity) > 80) {
                text += `नमी बहुत ज़्यादा है, फ़ंगल रोगों का खतरा हो सकता है। फसल पर नज़र रखें। `;
            }

            if (advisory.length) {
                text += `कृषि सलाह: ${advisory.join(". ")}। `;
            }

            if (forecast.length) {
                text += `अगले कुछ दिनों का अनुमान: `;
                forecast.forEach(f => {
                    text += `${f.date} को ${f.desc}, तापमान ${f.minTemp} से ${f.maxTemp} डिग्री, नमी ${f.humidity} प्रतिशत। `;
                });
            }

            text += `अपनी खेती की योजना मौसम के अनुसार बनाएँ।`;
            return text;
        } else {
            let text = `Here is the weather report for ${city}. `;
            text += `Currently the temperature is ${c.temp} degrees Celsius, feels like ${c.feelsLike} degrees. `;
            text += `The weather is ${c.desc}. `;
            text += `Humidity is ${c.humidity} percent, wind speed is ${c.windSpeed} kilometers per hour from ${c.windDir}. `;
            text += `Visibility is ${c.visibility} kilometers, pressure is ${c.pressure} millibars, and UV index is ${c.uv}. `;

            if (parseInt(c.temp) > 38) {
                text += `The temperature is very high. Increase irrigation frequency and avoid fieldwork during peak afternoon hours. `;
            } else if (parseInt(c.temp) < 10) {
                text += `It's quite cold. Protect frost-sensitive crops with mulch or covers. `;
            }

            if (parseInt(c.humidity) > 80) {
                text += `Humidity is very high. Watch out for fungal diseases in your crops. `;
            }

            if (advisory.length) {
                text += `Farming advisory: ${advisory.join(". ")}. `;
            }

            if (forecast.length) {
                text += `Forecast for the coming days: `;
                forecast.forEach(f => {
                    text += `On ${f.date}, ${f.desc}, temperature ${f.minTemp} to ${f.maxTemp} degrees, humidity ${f.humidity} percent. `;
                });
            }

            text += `Plan your farming activities according to the weather.`;
            return text;
        }
    }

    // ════════════════════════════════════════════════════════════
    //  MANDI BHAV — Rich explanation
    // ════════════════════════════════════════════════════════════
    function explainMandi(data) {
        const crop = data.crop;
        const mandis = data.mandis || [];
        const msp = data.msp;
        const avg = data.avg_price;
        const unit = data.unit || "quintal";

        if (!mandis.length) return isHi() ? "कोई मंडी भाव उपलब्ध नहीं है।" : "No mandi prices available.";

        // Find best and worst markets
        const sorted = [...mandis].sort((a, b) => (b.price || b.modal_price || 0) - (a.price || a.modal_price || 0));
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        const bestPrice = best.price || best.modal_price || 0;
        const worstPrice = worst.price || worst.modal_price || 0;

        if (isHi()) {
            let text = `${crop || "चयनित फसल"} के मंडी भाव की जानकारी। `;

            if (msp) {
                text += `सरकार का न्यूनतम समर्थन मूल्य ${msp} रुपये प्रति ${unit} है। `;
                if (avg > msp) {
                    text += `अच्छी खबर! बाज़ार का औसत भाव ${avg} रुपये है, जो MSP से ${avg - msp} रुपये ज़्यादा है। यह बेचने का अच्छा समय है। `;
                } else if (avg < msp) {
                    text += `ध्यान दें, बाज़ार का औसत भाव ${avg} रुपये है, जो MSP से ${msp - avg} रुपये कम है। सरकारी खरीद केंद्र पर बेचना बेहतर होगा। `;
                } else {
                    text += `बाज़ार का औसत भाव ${avg} रुपये है, जो MSP के बराबर है। `;
                }
            } else if (avg) {
                text += `बाज़ार का औसत भाव ${avg} रुपये प्रति ${unit} है। `;
            }

            text += `कुल ${mandis.length} मंडियों से भाव मिले हैं। `;

            if (best && best.name) {
                text += `सबसे अच्छा भाव ${best.name || best.market} मंडी में ${bestPrice} रुपये प्रति ${unit} मिल रहा है`;
                if (best.state) text += `, ${best.district || ""} ${best.state} में`;
                text += `। `;
            }

            if (worst && worst.name && mandis.length > 1) {
                text += `सबसे कम भाव ${worst.name || worst.market} में ${worstPrice} रुपये है। `;
            }

            if (mandis.length > 1) {
                text += `भाव में ${bestPrice - worstPrice} रुपये का अंतर है। `;
                text += `इसलिए सही मंडी का चुनाव करना बहुत ज़रूरी है। `;
            }

            if (best.variety) {
                text += `${best.variety} किस्म का भाव सबसे अच्छा है। `;
            }

            text += `रोज़ाना भाव बदलते हैं, इसलिए बेचने से पहले ताज़ा भाव ज़रूर देखें।`;
            return text;
        } else {
            let text = `Here are the mandi prices for ${crop || "the selected crop"}. `;

            if (msp) {
                text += `The government Minimum Support Price is ${msp} rupees per ${unit}. `;
                if (avg > msp) {
                    text += `Good news! The market average price is ${avg} rupees, which is ${avg - msp} rupees above MSP. This is a good time to sell. `;
                } else if (avg < msp) {
                    text += `Note that the market average is ${avg} rupees, which is ${msp - avg} rupees below MSP. Consider selling at a government procurement center for better rates. `;
                } else {
                    text += `The market average price is ${avg} rupees, equal to MSP. `;
                }
            } else if (avg) {
                text += `The market average price is ${avg} rupees per ${unit}. `;
            }

            text += `Prices from ${mandis.length} mandis were found. `;

            if (best && best.name) {
                text += `The best price is at ${best.name || best.market} mandi at ${bestPrice} rupees per ${unit}`;
                if (best.state) text += ` in ${best.district || ""} ${best.state}`;
                text += `. `;
            }

            if (worst && worst.name && mandis.length > 1) {
                text += `The lowest price is at ${worst.name || worst.market} at ${worstPrice} rupees. `;
                text += `There is a difference of ${bestPrice - worstPrice} rupees between the best and worst mandis. `;
                text += `Choosing the right mandi can significantly increase your earnings. `;
            }

            if (best.variety) {
                text += `The ${best.variety} variety is getting the best prices. `;
            }

            text += `Prices change daily, so always check the latest rates before selling your produce.`;
            return text;
        }
    }

    // ════════════════════════════════════════════════════════════
    //  MANDI OVERVIEW — Explain the overview table
    // ════════════════════════════════════════════════════════════
    function explainMandiOverview(data) {
        const crops = data.crops || [];
        if (!crops.length) return isHi() ? "कोई मंडी भाव उपलब्ध नहीं है।" : "No mandi prices available.";

        const aboveMSP = crops.filter(c => c.msp && c.avg_price > c.msp);
        const belowMSP = crops.filter(c => c.msp && c.avg_price < c.msp);

        if (isHi()) {
            let text = `आज की मंडी भाव का सारांश। कुल ${crops.length} फसलों के भाव उपलब्ध हैं। `;
            if (aboveMSP.length) {
                text += `${aboveMSP.length} फसलों का भाव MSP से ऊपर है, जिनमें `;
                text += aboveMSP.slice(0, 3).map(c => `${c.crop} का भाव ${c.avg_price} रुपये`).join(", ");
                text += ` शामिल हैं। `;
            }
            if (belowMSP.length) {
                text += `${belowMSP.length} फसलों का भाव MSP से नीचे है। `;
                text += belowMSP.slice(0, 2).map(c => `${c.crop} का भाव ${c.avg_price} रुपये है जबकि MSP ${c.msp} रुपये है`).join("। ");
                text += `। इन फसलों को सरकारी खरीद केंद्र पर बेचें। `;
            }
            text += `किसी भी फसल पर क्लिक करके विस्तृत मंडी भाव देख सकते हैं।`;
            return text;
        } else {
            let text = `Here is today's mandi price summary. Prices for ${crops.length} crops are available. `;
            if (aboveMSP.length) {
                text += `${aboveMSP.length} crops are trading above MSP, including `;
                text += aboveMSP.slice(0, 3).map(c => `${c.crop} at ${c.avg_price} rupees`).join(", ");
                text += `. `;
            }
            if (belowMSP.length) {
                text += `${belowMSP.length} crops are trading below MSP. `;
                text += belowMSP.slice(0, 2).map(c => `${c.crop} is at ${c.avg_price} rupees while MSP is ${c.msp} rupees`).join(". ");
                text += `. Consider selling these at government procurement centers. `;
            }
            text += `Click on any crop to see detailed mandi-wise prices.`;
            return text;
        }
    }

    // ════════════════════════════════════════════════════════════
    //  DISEASE DETECTION — Rich explanation
    // ════════════════════════════════════════════════════════════
    function explainDisease(data) {
        const diseases = data.diseases || [];
        const modelUsed = data.model_used;
        if (!diseases.length) return isHi() ? "कोई रोग विश्लेषण उपलब्ध नहीं है।" : "No disease analysis available.";

        const d = diseases[0];

        if (isHi()) {
            let text = "";
            if (modelUsed === "cnn") {
                text += `यह विश्लेषण हमारे AI कैमरा मॉडल से किया गया है, जो 95 प्रतिशत से अधिक सटीक है। `;
            } else {
                text += `यह विश्लेषण आपके बताए लक्षणों के आधार पर किया गया है। बेहतर परिणाम के लिए फोटो भी अपलोड करें। `;
            }

            if (d.is_healthy) {
                text += `खुशखबरी! आपकी फसल स्वस्थ दिख रही है। कोई बीमारी नहीं पाई गई। `;
                text += `फिर भी, नियमित रूप से फसल की जाँच करते रहें और अच्छी कृषि प्रथाओं का पालन करें।`;
                return text;
            }

            text += `${d.crop || ""} में ${d.disease_hi || d.disease} नामक रोग पाया गया है। `;
            text += `इसकी गंभीरता ${d.severity === "high" ? "ज़्यादा" : d.severity === "medium" ? "मध्यम" : "कम"} है और विश्वास ${d.confidence} प्रतिशत है। `;
            text += `यह रोग ${d.type === "Fungal" ? "फफूंद" : d.type === "Bacterial" ? "बैक्टीरिया" : d.type === "Viral" ? "वायरस" : d.type} के कारण होता है। `;

            if (d.symptoms_hi || d.symptoms) {
                text += `लक्षण: ${d.symptoms_hi || d.symptoms}। `;
            }

            if (d.treatment_hi || d.treatment) {
                text += `उपचार: ${d.treatment_hi || d.treatment}। `;
            }

            if (d.severity === "high") {
                text += `यह रोग गंभीर है। तुरंत कार्रवाई करें, नहीं तो पूरी फसल खराब हो सकती है। `;
            }

            if (diseases.length > 1) {
                text += `अन्य संभावित रोग: `;
                text += diseases.slice(1, 3).map(dd => dd.disease_hi || dd.disease).join(", ");
                text += `। इनकी भी जाँच करें। `;
            }

            text += `यदि रोग बढ़ता है तो अपने नज़दीकी कृषि विज्ञान केंद्र से संपर्क करें।`;
            return text;
        } else {
            let text = "";
            if (modelUsed === "cnn") {
                text += `This analysis was done by our AI camera model with over 95 percent accuracy. `;
            } else {
                text += `This analysis is based on the symptoms you described. For better accuracy, also upload a photo of the affected leaf. `;
            }

            if (d.is_healthy) {
                text += `Good news! Your crop looks healthy. No disease was detected. `;
                text += `Continue monitoring your crop regularly and follow good agricultural practices.`;
                return text;
            }

            text += `A disease called ${d.disease} has been detected in ${d.crop}. `;
            text += `The severity is ${d.severity} and confidence is ${d.confidence} percent. `;
            text += `This is a ${d.type} disease. `;

            if (d.symptoms) {
                text += `The symptoms include: ${d.symptoms}. `;
            }

            if (d.treatment) {
                text += `Recommended treatment: ${d.treatment}. `;
            }

            if (d.severity === "high") {
                text += `This is a serious condition. Take immediate action to prevent the disease from spreading to the entire crop. `;
            }

            if (diseases.length > 1) {
                text += `Other possible diseases include `;
                text += diseases.slice(1, 3).map(dd => dd.disease).join(" and ");
                text += `. Check for these as well. `;
            }

            text += `If the disease persists, contact your nearest Krishi Vigyan Kendra for expert help.`;
            return text;
        }
    }

    // ════════════════════════════════════════════════════════════
    //  SOIL ANALYSIS — Rich explanation
    // ════════════════════════════════════════════════════════════
    function explainSoil(data) {
        const recs = data.recommendations || [];
        const reportId = data.report_id;
        if (!recs.length) return isHi() ? "कोई मिट्टी विश्लेषण उपलब्ध नहीं है।" : "No soil analysis available.";

        const low = recs.filter(r => r.status.toLowerCase() === "low");
        const high = recs.filter(r => r.status.toLowerCase() === "high");
        const normal = recs.filter(r => r.status.toLowerCase() === "normal" || r.status.toLowerCase() === "medium");

        if (isHi()) {
            let text = `आपकी मिट्टी की जाँच रिपोर्ट तैयार है`;
            if (reportId) text += `, रिपोर्ट नंबर ${reportId}`;
            text += `। `;

            if (normal.length) {
                text += `अच्छी खबर: ${normal.map(r => r.nutrient).join(", ")} की मात्रा सामान्य है। `;
            }

            if (low.length) {
                text += `आपकी मिट्टी में ${low.map(r => r.nutrient).join(", ")} की कमी है। `;
                low.forEach(r => {
                    text += `${r.nutrient} के लिए सलाह: ${r.action}। `;
                });
            }

            if (high.length) {
                text += `${high.map(r => r.nutrient).join(", ")} की मात्रा ज़्यादा है। `;
                high.forEach(r => {
                    text += `${r.nutrient}: ${r.action}। `;
                });
            }

            text += `सही मात्रा में खाद डालने से फसल की उपज बढ़ती है और लागत कम होती है। `;
            text += `हर 6 महीने में मिट्टी की जाँच कराएँ।`;
            return text;
        } else {
            let text = `Your soil test report is ready`;
            if (reportId) text += `, report number ${reportId}`;
            text += `. `;

            if (normal.length) {
                text += `Good news: ${normal.map(r => r.nutrient).join(", ")} levels are in the normal range. `;
            }

            if (low.length) {
                text += `Your soil is deficient in ${low.map(r => r.nutrient).join(", ")}. `;
                low.forEach(r => {
                    text += `For ${r.nutrient}: ${r.action}. `;
                });
            }

            if (high.length) {
                text += `${high.map(r => r.nutrient).join(", ")} levels are too high. `;
                high.forEach(r => {
                    text += `For ${r.nutrient}: ${r.action}. `;
                });
            }

            text += `Applying the right amount of fertilizer increases yield and reduces costs. `;
            text += `Get your soil tested every 6 months for best results.`;
            return text;
        }
    }

    // ════════════════════════════════════════════════════════════
    //  GOVERNMENT SCHEMES — Rich explanation
    // ════════════════════════════════════════════════════════════
    function explainSchemes(data) {
        const eligible = data.eligible || [];
        const total = data.total || 0;

        if (!eligible.length) return isHi() ? "कोई योजना उपलब्ध नहीं मिली।" : "No eligible schemes found.";

        if (isHi()) {
            let text = `आपके लिए कुल ${total} सरकारी योजनाएँ उपलब्ध हैं। मैं आपको एक-एक करके बताता हूँ। `;

            eligible.forEach((s, i) => {
                text += `${i + 1} नंबर, ${s.name_hi || s.name}। `;
                text += `${s.desc_hi || s.desc}। `;
                if (s.benefits) text += `इसका लाभ: ${s.benefits}। `;
            });

            text += `इन सभी योजनाओं के लिए ऑनलाइन आवेदन कर सकते हैं। `;
            text += `अपने नज़दीकी CSC सेंटर या बैंक में भी जानकारी ले सकते हैं। `;
            text += `सरकारी योजनाओं का लाभ उठाकर अपनी खेती को और बेहतर बनाएँ।`;
            return text;
        } else {
            let text = `You are eligible for ${total} government schemes. Let me explain each one. `;

            eligible.forEach((s, i) => {
                text += `Number ${i + 1}, ${s.name}. `;
                text += `${s.desc}. `;
                if (s.benefits) text += `Benefits: ${s.benefits}. `;
            });

            text += `You can apply online for all these schemes. `;
            text += `You can also visit your nearest CSC center or bank for more information. `;
            text += `Take advantage of these government schemes to improve your farming.`;
            return text;
        }
    }

    // ════════════════════════════════════════════════════════════
    //  IoT SENSOR DASHBOARD — Rich explanation
    // ════════════════════════════════════════════════════════════
    function explainIoT(data) {
        const r = data;
        if (!r) return isHi() ? "सेंसर डेटा उपलब्ध नहीं है।" : "No sensor data available.";

        if (isHi()) {
            let text = `आपके खेत के सेंसर की ताज़ा रीडिंग। `;

            // Temperature
            if (r.temperature !== -999) {
                text += `तापमान ${r.temperature.toFixed(1)} डिग्री सेल्सियस है। `;
                if (r.temperature > 40) text += `यह बहुत गर्म है, फसलों को छाया और पानी दें। `;
                else if (r.temperature > 35) text += `तापमान ज़्यादा है, सिंचाई बढ़ाएँ। `;
                else if (r.temperature < 10) text += `ठंड है, फसलों को ढककर रखें। `;
                else text += `तापमान फसलों के लिए ठीक है। `;
            }

            // Humidity
            if (r.humidity !== -999) {
                text += `हवा की नमी ${r.humidity.toFixed(0)} प्रतिशत है। `;
                if (r.humidity > 85) text += `नमी बहुत ज़्यादा है, फफूंद रोगों का खतरा है। `;
                else if (r.humidity < 30) text += `नमी कम है, पत्तियाँ मुरझा सकती हैं। `;
            }

            // Moisture
            const moistureOk = r.moisture_connected !== false;
            if (moistureOk && r.moisture >= 0) {
                text += `मिट्टी की नमी ${r.moisture.toFixed(0)} प्रतिशत है। `;
                if (r.moisture < 25) text += `मिट्टी बहुत सूखी है! तुरंत सिंचाई करें। `;
                else if (r.moisture < 40) text += `मिट्टी सूखने लगी है, जल्दी पानी दें। `;
                else if (r.moisture > 85) text += `मिट्टी में पानी ज़्यादा है, जड़ सड़ने का खतरा है। `;
                else text += `मिट्टी की नमी अच्छी है। `;
            }

            // pH
            const phOk = r.ph_connected !== false && !r.ph_in_air;
            if (phOk && r.ph >= 0) {
                text += `मिट्टी का pH ${r.ph.toFixed(1)} है। `;
                if (r.ph < 5.5) text += `मिट्टी अम्लीय है, चूना डालें। `;
                else if (r.ph > 8.0) text += `मिट्टी क्षारीय है, जिप्सम डालें। `;
                else text += `pH सामान्य है, ज़्यादातर फसलों के लिए उपयुक्त। `;
            }

            // Advisories
            if (r.advisories && r.advisories.length) {
                text += `सलाह: `;
                r.advisories.forEach(a => {
                    text += `${a.msg_hi || a.msg}। `;
                });
            }

            text += `सेंसर हर 30 सेकंड में अपडेट होते हैं।`;
            return text;
        } else {
            let text = `Here are the latest readings from your field sensors. `;

            if (r.temperature !== -999) {
                text += `Temperature is ${r.temperature.toFixed(1)} degrees Celsius. `;
                if (r.temperature > 40) text += `This is extremely hot. Provide shade and extra water to your crops. `;
                else if (r.temperature > 35) text += `Temperature is high, increase irrigation frequency. `;
                else if (r.temperature < 10) text += `It's cold, protect frost-sensitive crops. `;
                else text += `Temperature is good for crops. `;
            }

            if (r.humidity !== -999) {
                text += `Air humidity is ${r.humidity.toFixed(0)} percent. `;
                if (r.humidity > 85) text += `Very high humidity increases the risk of fungal diseases. `;
                else if (r.humidity < 30) text += `Low humidity may cause leaf wilting. `;
            }

            const moistureOk = r.moisture_connected !== false;
            if (moistureOk && r.moisture >= 0) {
                text += `Soil moisture is ${r.moisture.toFixed(0)} percent. `;
                if (r.moisture < 25) text += `Soil is very dry! Irrigate immediately. `;
                else if (r.moisture < 40) text += `Soil is getting dry, water your crops soon. `;
                else if (r.moisture > 85) text += `Soil is waterlogged, there is a risk of root rot. `;
                else text += `Soil moisture is in the optimal range. `;
            }

            const phOk = r.ph_connected !== false && !r.ph_in_air;
            if (phOk && r.ph >= 0) {
                text += `Soil pH is ${r.ph.toFixed(1)}. `;
                if (r.ph < 5.5) text += `Soil is acidic, apply lime to correct it. `;
                else if (r.ph > 8.0) text += `Soil is alkaline, apply gypsum. `;
                else text += `pH is in the normal range, suitable for most crops. `;
            }

            if (r.advisories && r.advisories.length) {
                text += `Advisories: `;
                r.advisories.forEach(a => {
                    text += `${a.msg}. `;
                });
            }

            text += `Sensors update every 30 seconds.`;
            return text;
        }
    }

    // ── Public API ───────────────────────────────────────────────
    return {
        speak,
        stop,
        createSpeakButton,
        explainCrop,
        explainWeather,
        explainMandi,
        explainMandiOverview,
        explainDisease,
        explainSoil,
        explainSchemes,
        explainIoT,
    };
})();
