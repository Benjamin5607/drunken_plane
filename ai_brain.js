// ai_brain.js
// Drunken Plane AI Bartender 'Emily' 🍸

export class AIBrain {
    constructor(apiKey, translations) {
        this.apiKey = apiKey;
        this.t = translations;
        this.models = ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"];
    }

    // 📏 거리 계산 (GPS)
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

    // 🔍 [Bar Search] 술과 분위기 검색
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
            const content = ((p.name||"")+(p.category||"")+(p.label||"")+(p.desc_ko||"")+(p.address||"")).toLowerCase();
            keywords.forEach(k => {
                if (content.includes(k)) score += 10;
                if (['whisky', 'cocktail', 'beer', 'wine', 'bar', 'pub', 'soju'].includes(k)) score += 5;
            });
            if (userLoc && p.distance < 5) score += 20; 
            else if (userLoc && p.distance < 20) score += 10;
            return { place: p, score: score };
        });

        return scored.filter(i => i.score > 0)
            .sort((a, b) => b.score - a.score || a.place.distance - b.place.distance)
            .map(i => ({ ...i.place, distInfo: userLoc ? `(${i.place.distance.toFixed(1)}km)` : "" }))
            .slice(0, 10);
    }

    // 💬 채팅 (에밀리 페르소나)
    async ask(query, history, db, currentCountry, userLoc) {
        if (!this.apiKey || this.apiKey.includes("__SECRET")) return "🍸 API Key가 아직 도착하지 않았어요. (잠시 후 다시 시도해주세요)";
        
        const relevantPlaces = this.getRelevantPlaces(query, db, userLoc);
        const contextStr = relevantPlaces.length > 0 ? relevantPlaces.map(p => `- [${p.name}] (${p.origin_country}) ${p.distInfo||""}: ${p.desc_ko||""}`).join("\n") : "No matches in DB.";

        const systemPrompt = `
        You are Emily, a witty AI Bartender.
        User Loc: ${userLoc ? `${userLoc.lat},${userLoc.lon}` : "Unknown"} | Map: ${currentCountry}
        [DB RESULTS] ${contextStr}
        [RULES]
        1. Prioritize DB results. If empty, use external knowledge (mark as External).
        2. Match Vibe: "Quiet"->Whisky/Wine, "Party"->Pub/Club.
        3. Tone: Sophisticated, warm. Use emojis (🥃).
        4. Wrap names in [ ].
        `;
        return await this._callGroq([{role:"system",content:systemPrompt}, ...history.slice(-4), {role:"user",content:query}]);
    }

    // 📝 리뷰 작성
    async writeReview(name, country, isExternal, data) {
        const prompt = isExternal 
            ? `Write a 'Bartender's Review' for "${name}" in "${country}" (External). Vibe? Drink? Price? Language: ${this.t.ai}`
            : `Write a 'Tasting Note' for "${name}" in "${country}". Context: ${data.desc_ko}. Structure: 1.🚪Vibe 2.🥃Menu 3.💋Tip. Language: ${this.t.ai}`;
        return await this._callGroq([{role:"user",content:prompt}]);
    }

    async _callGroq(messages) {
        for (let model of this.models) {
            try {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
                    body: JSON.stringify({ model: model, messages: messages, temperature: 0.7 }) 
                });
                if (res.ok) {
                    const data = await res.json();
                    return data.choices[0].message.content;
                }
            } catch (e) { console.error(e); }
        }
        return "Emily is busy mixing drinks. 🍸 (Network Error)";
    }
}
