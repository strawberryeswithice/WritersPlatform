(function() {
    const editor = document.getElementById('storyEditor');
    const wordSpan = document.getElementById('wordCount');
    const charSpan = document.getElementById('charCount');
    const docTitle = document.getElementById('docTitle');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const aiBox = document.getElementById('aiResponse');
    const saveBtn = document.getElementById('saveBtn');
    const exportBtn = document.getElementById('exportBtn');

    document.getElementById('boldBtn').addEventListener('click', () => document.execCommand('bold', false));
    document.getElementById('italicBtn').addEventListener('click', () => document.execCommand('italic', false));
    document.getElementById('alignLeftBtn').addEventListener('click', () => document.execCommand('justifyLeft', false));
    document.getElementById('alignCenterBtn').addEventListener('click', () => document.execCommand('justifyCenter', false));
    document.getElementById('alignRightBtn').addEventListener('click', () => document.execCommand('justifyRight', false));
    document.getElementById('blockquoteBtn').addEventListener('click', () => document.execCommand('formatBlock', false, 'blockquote'));

    document.getElementById('fontSizeSelect').addEventListener('change', (e) => {
        const val = e.target.value;
        if (val !== '3') document.execCommand('fontSize', false, val);
        else document.execCommand('fontSize', false, '3');
    });

    function updateCounters() {
        const text = editor.innerText || editor.textContent || '';
        const trimmed = text.trim();
        charSpan.textContent = trimmed.length;
        let words = trimmed.length > 0 ? trimmed.split(/\s+/).filter(w => w.length > 0).length : 0;
        wordSpan.textContent = words;
    }
    editor.addEventListener('input', updateCounters);
    const observer = new MutationObserver(updateCounters);
    observer.observe(editor, { childList: true, subtree: true, characterData: true });
    updateCounters();

    function formatMarkdown(text) {
        if (!text) return '';
        let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/^####(.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^###(.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^##(.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^#(.*$)/gim, '<h1>$1</h1>');
        html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
        html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
        html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/gim, function(match) {
            if (match.match(/^\d+\./m)) {
                return '<ol>' + match + '</ol>';
            } else {
                return '<ul>' + match + '</ul>';
            }
        });
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    function showAIResponse(content, isError = false, elapsedTime = null) {
        const placeholder = aiBox.querySelector('.placeholder-ai');
        if (placeholder) {
            placeholder.remove();
        }
        let responseDiv = aiBox.querySelector('.ai-response-content');
        if (!responseDiv) {
            responseDiv = document.createElement('div');
            responseDiv.className = 'ai-response-content';
            aiBox.appendChild(responseDiv);
        }
        responseDiv.className = `ai-response-content ${isError ? 'error' : ''}`;
        if (isError) {
            responseDiv.innerHTML = content.replace(/\n/g, '<br>');
        } else {
            responseDiv.innerHTML = formatMarkdown(content);
        }
        responseDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            const textToAnalyze = editor.innerText || editor.textContent || '';
            if (textToAnalyze.trim().length < 50) {
                showAIResponse('Текст слишком короткий', true);
                return;
            }
            if (textToAnalyze.trim().length > 5000) {
                showAIResponse('Текст слишком длинный', true);
                return;
            }

            showAIResponse('Функция анализа текста временно отключена', true);
            console.info('API отключен');

        });
    }
})();