let currentPopup = null;
let currentSelectionRange = null;
let currentText = "";
let currentTone = "professional"; // Fallback default
let autoReplace = false;

// Sync settings on load (optional, but good for initial tone)
chrome.storage.sync.get({ geminiTone: 'professional', geminiAutoReplace: false }, (items) => {
    currentTone = items.geminiTone;
    autoReplace = items.geminiAutoReplace;
});

// Update settings when they change
chrome.storage.onChanged.addListener((changes) => {
    if (changes.geminiTone) currentTone = changes.geminiTone.newValue;
    if (changes.geminiAutoReplace) autoReplace = changes.geminiAutoReplace.newValue;
});

// Message Listener from Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "trigger-translation") {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text) {
            currentText = text;
            currentSelectionRange = selection.getRangeAt(0);

            if (autoReplace) {
                handleAutoReplace(text);
            } else {
                showPopup(true); // Show UI
                requestTranslation(currentText, currentTone);
            }
        }
    } else if (request.action === "display-translation") {
        currentText = request.originalText || window.getSelection().toString().trim();
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            currentSelectionRange = selection.getRangeAt(0);
        }
        showPopup(false);
        const contentEl = currentPopup ? currentPopup.querySelector('.ai-translate-content') : null;
        if (contentEl) {
            contentEl.textContent = request.text;
        }
    }
});

function handleAutoReplace(text) {
    // Visual indicator that something is happening (optional, maybe cursor change)
    document.body.style.cursor = 'wait';

    chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        tone: currentTone // Use the user's preferred tone
    }, (response) => {
        document.body.style.cursor = 'default';

        if (chrome.runtime.lastError) {
            alert("Translation Error: " + chrome.runtime.lastError.message);
            return;
        }

        if (response && response.success) {
            replaceSelection(response.data);
        } else {
            alert("Translation Failed: " + (response.error || "Unknown error"));
        }
    });
}

function replaceSelection(newText) {
    if (currentSelectionRange) {
        currentSelectionRange.deleteContents();
        currentSelectionRange.insertNode(document.createTextNode(newText));

        // Clear selection to avoid confusion
        window.getSelection().removeAllRanges();
    }
}

function requestTranslation(text, tone) {
    updateToneButtons(tone);
    chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        tone: tone
    }, (response) => {
        const contentEl = currentPopup ? currentPopup.querySelector('.ai-translate-content') : null;
        if (!contentEl) return;

        if (chrome.runtime.lastError) {
            showError(chrome.runtime.lastError.message);
            return;
        }

        if (response && response.success) {
            contentEl.textContent = response.data;
        } else {
            showError(response.error || "Unknown error");
        }
    });
}

function showPopup(isLoading = false) {
    removePopup();

    const rect = currentSelectionRange.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    const popup = document.createElement('div');
    popup.className = 'ai-translate-popup';
    popup.style.top = `${rect.bottom + scrollTop + 10}px`;
    popup.style.left = `${rect.left + scrollLeft}px`;

    popup.innerHTML = `
    <div class="ai-translate-header">
      <span class="ai-translate-title">AI Translator</span>
      <span class="ai-translate-close">&times;</span>
    </div>
    <div class="ai-translate-content">
      ${isLoading ? '<div class="ai-translate-loading">Translating...</div>' : ''}
    </div>
    <div class="ai-controls-row">
      <button class="ai-tone-btn" data-tone="professional">Professional</button>
      <button class="ai-tone-btn" data-tone="casual">Casual</button>
      <button class="ai-tone-btn" data-tone="concise">Concise</button>
    </div>
    <div class="ai-actions-row">
      <button class="ai-copy-btn" title="Copy to clipboard">📋 Copy</button>
      <button class="ai-speak-btn" title="Listen">🔊 Listen</button>
      <button class="ai-explain-btn" title="Explain context">💡 Explain</button>
    </div>
    <div class="ai-explanation-content"></div>
  `;

    document.body.appendChild(popup);
    currentPopup = popup;

    popup.querySelector('.ai-translate-close').addEventListener('click', removePopup);

    const buttons = popup.querySelectorAll('.ai-tone-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const newTone = e.target.dataset.tone;
            if (newTone !== currentTone) {
                // Hide explanation if tone changes
                const explainEl = currentPopup.querySelector('.ai-explanation-content');
                explainEl.style.display = 'none';
                explainEl.textContent = '';

                currentTone = newTone; // Temporarily override for this popup
                const contentEl = currentPopup.querySelector('.ai-translate-content');
                contentEl.innerHTML = '<div class="ai-translate-loading">Translating...</div>';
                requestTranslation(currentText, currentTone);
            }
        });
    });

    const explainBtn = popup.querySelector('.ai-explain-btn');
    explainBtn.addEventListener('click', () => {
        requestExplanation(currentText);
    });

    const speakBtn = popup.querySelector('.ai-speak-btn');
    speakBtn.addEventListener('click', () => {
        const contentEl = currentPopup ? currentPopup.querySelector('.ai-translate-content') : null;
        if (contentEl && contentEl.textContent) {
            handleSpeechToggle(contentEl.textContent, speakBtn);
        }
    });

    const copyBtn = popup.querySelector('.ai-copy-btn');
    copyBtn.addEventListener('click', () => {
        const contentEl = currentPopup ? currentPopup.querySelector('.ai-translate-content') : null;
        if (contentEl && contentEl.textContent) {
            copyText(contentEl.textContent, copyBtn);
        }
    });

    updateToneButtons(currentTone);
}

function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

function handleSpeechToggle(text, btn) {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btn.classList.remove('speaking');
        btn.innerHTML = '🔊 Listen'; // Reset text
        return;
    }

    // Simple heuristic: if text contains Spanish characters, assume Spanish, else English
    const isSpanish = /[áéíóúñ¿¡]/.test(text) || text.includes(' el ') || text.includes(' la ');
    const lang = isSpanish ? 'es-ES' : 'en-US';

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;

    utterance.onstart = () => {
        btn.classList.add('speaking');
        btn.innerHTML = '⏹ Stop'; // Change text to Stop
    };

    utterance.onend = () => {
        btn.classList.remove('speaking');
        btn.innerHTML = '🔊 Listen'; // Reset text
    };

    utterance.onerror = () => {
        btn.classList.remove('speaking');
        btn.innerHTML = '🔊 Listen';
    };

    window.speechSynthesis.speak(utterance);
}

function requestExplanation(text) {
    if (!currentPopup) return;

    const explainEl = currentPopup.querySelector('.ai-explanation-content');
    explainEl.style.display = 'block';
    explainEl.innerHTML = '<div class="ai-translate-loading" style="padding: 5px 0; font-size: 12px;">Analyzing context...</div>';

    chrome.runtime.sendMessage({
        action: 'explain',
        text: text
    }, (response) => {
        if (chrome.runtime.lastError) {
            explainEl.textContent = "Error: " + chrome.runtime.lastError.message;
            return;
        }

        if (response && response.success) {
            explainEl.textContent = response.data;
        } else {
            explainEl.textContent = "Could not generate explanation.";
        }
    });
}

function updateToneButtons(activeTone) {
    if (!currentPopup) return;
    const buttons = currentPopup.querySelectorAll('.ai-tone-btn');
    buttons.forEach(b => {
        if (b.dataset.tone === activeTone) b.classList.add('active');
        else b.classList.remove('active');
    });
}

function removePopup() {
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
}

function showError(msg) {
    if (currentPopup) {
        const content = currentPopup.querySelector('.ai-translate-content');
        content.innerHTML = `<div class="ai-error">${msg}</div>`;
    } else {
        alert("Translation Error: " + msg);
    }
}

document.addEventListener('mousedown', (e) => {
    if (currentPopup && !currentPopup.contains(e.target)) {
        removePopup();
    }
});
