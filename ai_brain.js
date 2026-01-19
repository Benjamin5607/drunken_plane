// ai_brain.js
// Drunken Plane: AI Bartender 'Emily' 🍸

export class AIBrain {
    constructor(apiKey, translations) {
        this.apiKey = apiKey;
        this.t = translations;
        this.models = ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"];
    }

    // 📏 거리 계산 (GPS 기반 추천용)
    calculateDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 99999;
        const R = 6371; 
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // 🔍 [Bar Search] 분위기와 주종에 따른 검색
    getRelevantPlaces(query, db, userLoc) {
        if (!query) return [];
        const keywords = query.toLowerCase().split(" ");
        let allCandidates = [];

        Object.keys(db).forEach(country => {
            db[country].forEach(place => {
                let dist = userLoc ? this.calculateDistance(userLoc.lat, userLoc.lon, place.lat, place.lon) : 0;
                allCandidates.push({ ...place, origin_country: country, distance: dist });
            });
        });

        let scored = allCandidates.map(p => {
            let score = 0;
            const content = (
                (p.name || "") + " " + (p.category || "") + " " + 
                (p.label || "") + " " + (p.desc_ko || "") + " " + 
                (p.address || "") + " " + (p.origin_country || "")
            ).toLowerCase();

            keywords.forEach(k => {
                if (content.includes(k)) score += 10;
                // 술 종류 가산점 (Whisky, Wine, Beer 등)
                if (['whisky', 'wine', 'beer', 'cocktail', 'soju'].includes(k) && content.includes(k)) {
                    score += 5;
                }
            });

            // 거리 점수 (가까우면 가산점)
            if (userLoc && p.distance < 5) score += 15; 
            else if (userLoc && p.distance < 20) score += 5;

            return { place: p, score: score };
        });

        let relevant = scored
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.place.distance - b.place.distance)
            .map(item => {
                let distInfo = userLoc ? `(${item.place.distance.toFixed(1)}km away)` : "";
                return { ...item.place, distInfo: distInfo };
            });

        return relevant.slice(0, 10);
    }

    // 💬 채팅 (Emily 페르소나)
    async ask(query, history, db, currentCountry, userLoc) {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) return "🍸 Please show me your ID (API Key) first.";

        const relevantPlaces = this.getRelevantPlaces(query, db, userLoc);
        
        let contextStr = "";
        let mode = "EXTERNAL"; 

        if (relevantPlaces.length > 0) {
            mode = "DATABASE"; 
            contextStr = relevantPlaces.map(p => 
                `- [${p.name}] (${p.origin_country}, ${p.label}) ${p.distInfo || ""}: ${p.desc_ko || "Good vibes"}`
            ).join("\n");
        } else {
            contextStr = "No specific bar found in DB.";
        }

        const systemPrompt = `
        You are Emily, a charming and knowledgeable AI Bartender.
        Current Map: ${currentCountry}
        User Query: "${query}"
        
        [MENU / DB SEARCH RESULTS]
        ${contextStr}

        [BARTENDER RULES]
        1. 🥃 **Vibe Check:** - If user wants "Quiet", recommend Speakeasy bars, Whisky lounges, or Wine bars.
           - If user wants "Party", recommend Pubs, Clubs, or noisy Beer halls.
           - If user wants "Local", recommend Izakaya (Japan) or Pocha (Korea).
        
        2. 📍 **Recommendation:**
           - Prioritize [DB SEARCH RESULTS].
           - If DB is empty, use your general knowledge (External) but mark it as such.
           
        3. **Tone:** Witty, sophisticated, welcoming. Use emojis like 🍸, 🍺, 🥂.
        
        4. **Format:**
           - [Place Name]
           - [Place Name] (External)
        `;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-4),
            { role: "user", content: query }
        ];

        return await this._callGroq(messages);
    }

    // 📝 상세 리뷰 (Tasting Note)
    async writeReview(placeName, country, isExternal = false, placeData = null) {
        let prompt = "";
        if (isExternal) {
            prompt = `
            User asks about "${placeName}" in ${country}. (Not in DB).
            Based on general fame, write a 'Bartender's Review'.
            1. Vibe & Crowd?
            2. Best Drink to order?
            3. Price Level?
            Language: ${this.t.ai}
            `;
        } else {
            prompt = `
            Write a detailed Bartender's Review for "${placeName}" in ${country}.
            Data: ${placeData.desc_ko || ""}
            Key info: ${placeData.label || ""}
            
            Structure:
            1. 🚪 First Impression (Vibe)
            2. 🥃 Signature Drink
            3. 👥 Perfect for (Dates, Solo, Group?)
            4. 🤫 Emily's Tip
            Language: ${this.t.ai}
            `;
        }
        return await this._callGroq([{role: "user", content: prompt}]);
    }

    async _callGroq(messages) {
        for (let model of this.models) {
            try {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
                    body: JSON.stringify({ model: model, messages: messages, temperature: 0.7 }) 
                });
                if (res.ok) {
                    const data = await res.json();
                    return data.choices[0].message.content;
                }
            } catch (e) { console.error(e); }
        }
        return "Sorry honey, the bar is too busy (Network Error).";
    }
}
