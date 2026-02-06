
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "translateContext",
        title: "Translate with Gemini",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "translateContext" && info.selectionText) {
        handleTranslationRequest(info.selectionText)
            .then(result => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'display-translation',
                    text: result,
                    originalText: info.selectionText
                });
            })
            .catch(error => {
                console.error("Context menu translation error:", error);
            });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translate') {
        handleTranslationRequest(request.text, request.tone)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }));

        return true; // Keep channel open
    }

    if (request.action === 'explain') {
        handleExplanationRequest(request.text)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }));

        return true; // Keep channel open
    }
});

chrome.commands.onCommand.addListener((command) => {
    if (command === "translate-selection") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "trigger-translation" });
            }
        });
    }
});

async function handleTranslationRequest(text, tone) {
    const settings = await getSettings();
    if (!settings.apiKey) {
        throw new Error("API Key missing. Click the extension icon to set it.");
    }

    // Use tone passed in request, or fallback to settings default
    const effectiveTone = tone || settings.tone || 'professional';
    let model = settings.model || 'gemini-1.5-flash';

    // Clean model name
    const cleanModel = model.replace('models/', '');

    const prompt = constructPrompt(text, effectiveTone);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${settings.apiKey}`;

    console.log(`Calling API: ${cleanModel} | Tone: ${effectiveTone}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || `API Error (${response.status})`);
    }

    const data = await response.json();
    const translation = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!translation) throw new Error("No translation returned.");

    return translation;
}

function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({
            geminiApiKey: '',
            geminiModel: 'gemini-1.5-flash',
            geminiTone: 'professional'
        }, (items) => {
            resolve({
                apiKey: items.geminiApiKey,
                model: items.geminiModel,
                tone: items.geminiTone
            });
        });
    });
}

function constructPrompt(text, tone) {
    // Smart Detect: Dictionary Mode for single words (or max 2 words)
    const wordCount = text.trim().split(/\s+/).length;

    if (wordCount <= 2) {
        return `System: You are a comprehensive bi-directional dictionary.
        
        Task: Identify the language of the input word.
        - If Input is English -> Target Language is Spanish.
        - If Input is Spanish -> Target Language is English.

        CRITICAL: All output (definitions, synonyms, parts of speech) MUST be in the Target Language.

        Format the output strictly as follows:
        **[Translated Word]** ([Part of Speech in Target Language])
        • [Meaning / Context in Target Language]
        • [Secondary Meaning / Synonym in Target Language]
        
        Rule: Keep it concise. No conversational filler.

        Input to define:
        "${text}"`;
    }

    // Standard Translation Mode
    let toneInstruction = "";
    switch (tone) {
        case 'casual':
            toneInstruction = "Translate with a natural, relaxed tone, like how people write on the internet. Use appropriate slang or informal phrasing where it fits naturally. Avoid stiff or overly formal language.";
            break;
        case 'concise':
            toneInstruction = "Translate directly and concisely. Remove unnecessary filler words and get straight to the point. Focus on brevity and clarity without losing the core meaning.";
            break;
        case 'professional':
        default:
            toneInstruction = "Translate with a high-level, formal tone suitable for business or technical contexts. Use precise, professional vocabulary and maintain a respectful, authoritative voice. Feel free to use technical terms where appropriate.";
            break;
    }

    return `System: You are a bi-directional translator. 
    Rule 1: If the text is English, translate it to Spanish.
    Rule 2: If the text is Spanish, translate it to English.
    Rule 3: ${toneInstruction}
    Rule 4: CRITICAL: Output ONLY the translated text. Do NOT add introductions like "Here is the translation" or quotes. Return just the raw translation.

    Text to translate:
    "${text}"`;
}

async function handleExplanationRequest(text) {
    const settings = await getSettings();
    if (!settings.apiKey) throw new Error("API Key missing.");

    const model = settings.model || 'gemini-1.5-flash';
    const cleanModel = model.replace('models/', '');

    // Construct Prompt
    const prompt = `System: You are a language expert. 
    Task: Explain the context, possible nuances, double meanings, or cultural references of the following text.
    Constraint: Keep the explanation VERY concise (max 2 sentences). If it's a simple phrase with no hidden meaning, just say "Literal translation."
    
    Text: "${text}"`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${settings.apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!response.ok) {
        throw new Error(`API Error (${response.status})`);
    }

    const data = await response.json();
    const explanation = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!explanation) throw new Error("No explanation returned.");

    return explanation;
}
