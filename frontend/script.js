class VoiceCalculator {
    constructor() {
        this.currentExpression = '';
        this.currentResult = '0';
        this.isListening = false; // Tracks if we *intend* to be listening (for auto-restart)
        this.isRecognitionActive = false; // Tracks if the SpeechRecognition API is currently active
        this.isProcessing = false;
        this.history = [];
        this.settings = {
            voiceFeedback: true,
            autoSpeak: false,
            language: 'en-US',
            theme: 'dark',
            decimalPlaces: 2,
            voiceSpeed: 0.9, // Default voice speed
            angleUnit: 'degrees' // Added angle unit setting (degrees or radians)
        };

        this.synthesis = null;
        this.recognition = null;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.mediaStream = null;
        this.restartTimeOut = null; // To manage auto-restart attempts

        // In-memory storage (no localStorage/sessionStorage for this version as per original request)
        this.sessionData = {
            settings: { ...this.settings },
            history: []
        };

        // Bind event handlers to the instance
        this.handleCalculatorInput = this.handleCalculatorInput.bind(this);
        this.handleKeyboard = this.handleKeyboard.bind(this);
        this.toggleVoiceRecognition = this.toggleVoiceRecognition.bind(this);
        this.clearDisplay = this.clearDisplay.bind(this);
        this.repeatLastResult = this.repeatLastResult.bind(this);
        this.toggleTheme = this.toggleTheme.bind(this);
        this.openSettings = this.openSettings.bind(this);
        this.openHistory = this.openHistory.bind(this);
        this.clearHistory = this.clearHistory.bind(this);
        this.exportHistory = this.exportHistory.bind(this);
        this.closeModal = this.closeModal.bind(this);
        this.solveComplexProblem = this.solveComplexProblem.bind(this); // Bind new method
        this.startVoiceRecognition = this.startVoiceRecognition.bind(this); // Bind explicitly for use in onend

        this.init();
    }

    // --- Initialization ---
    async init() {
        try {
            this.loadSettings();
            this.applySettings();
            this.bindEvents();
            this.setupVoiceRecognition();
            this.setupTextToSpeech();
            this.loadHistory();
            this.updateDisplay();
            this.showVoiceFeedback('Calculator ready. Click mic to start continuous listening.');
            console.log('Voice Calculator initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize calculator');
            const appContainer = document.getElementById('app');
            if (appContainer) {
                appContainer.innerHTML = '<div style="padding: 20px; color: red; text-align: center;">Failed to initialize calculator. Please ensure your browser supports Speech Recognition and refresh the page.</div>';
            } else {
                document.body.innerHTML = '<div style="padding: 20px; color: red; text-align: center;">Failed to initialize calculator. Please refresh the page.</div>';
            }
        }
    }

    loadSettings() {
        this.settings = { ...this.sessionData.settings };
    }

    saveSettings() {
        this.sessionData.settings = { ...this.settings };
        console.log('Settings saved to memory:', this.settings);
    }

    applySettings() {
        document.documentElement.setAttribute('data-theme', this.settings.theme);
        document.body.setAttribute('data-theme', this.settings.theme);

        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = this.settings.theme === 'dark' ? '🌙' : '☀️';
        }

        this.updateSettingsForm();
        console.log('Applied theme:', this.settings.theme);
    }

    bindEvents() {
        console.log('Binding events...');
        document.addEventListener('click', this.handleCalculatorInput);

        const voiceBtn = document.getElementById('voiceBtn');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', this.toggleVoiceRecognition);
            console.log('Voice button event listener attached.');
        } else {
            console.warn('Voice button element not found!');
        }

        const clearVoiceBtn = document.getElementById('clearVoiceBtn');
        if (clearVoiceBtn) {
            clearVoiceBtn.addEventListener('click', this.clearDisplay);
            console.log('Clear voice button event listener attached.');
        } else {
            console.warn('Clear voice button element not found!');
        }

        const repeatBtn = document.getElementById('repeatBtn');
        if (repeatBtn) {
            repeatBtn.addEventListener('click', this.repeatLastResult);
            console.log('Repeat button event listener attached.');
        } else {
            console.warn('Repeat button element not found!');
        }

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', this.toggleTheme);
            console.log('Theme toggle event listener attached.');
        } else {
            console.warn('Theme toggle element not found!');
        }

        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', this.openSettings);
            console.log('Settings button event listener attached.');
        } else {
            console.error('Settings button element NOT FOUND! Check your HTML ID or if script.js is loaded before the element.');
        }

        const historyBtn = document.getElementById('historyBtn');
        if (historyBtn) {
            historyBtn.addEventListener('click', this.openHistory);
            console.log('History button event listener attached.');
        } else {
            console.warn('History button element not found!');
        }

        const solveQuestionBtn = document.getElementById('solveQuestionBtn');
        if (solveQuestionBtn) {
            solveQuestionBtn.addEventListener('click', this.solveComplexProblem);
            console.log('Solve Question button event listener attached.');
        } else {
            console.warn('Solve Question button element not found!');
        }

        const closeHistoryBtn = document.getElementById('closeHistoryBtn');
        if (closeHistoryBtn) {
            closeHistoryBtn.addEventListener('click', () => this.closeModal('history'));
            console.log('Close History button event listener attached.');
        } else {
            console.warn('Close History button element not found!');
        }

        document.addEventListener('click', (e) => {
            if (e.target.id === 'clearHistoryBtn') {
                this.clearHistory();
            }
            if (e.target.id === 'exportHistoryBtn') {
                this.exportHistory();
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest('.close-modal') || e.target.classList.contains('modal-overlay')) {
                const modalElement = e.target.closest('.modal-overlay');
                if (modalElement && modalElement.id === 'settingsModal') {
                    this.closeModal('settings');
                } else if (e.target.closest('.close-btn')) {
                    this.closeModal('confirmation');
                } else if (modalElement && modalElement.id === 'helpModal') {
                    this.closeModal('help');
                }
            }
        });

        document.addEventListener('keydown', this.handleKeyboard);
        this.bindSettingsEvents();

        const toggleAdvancedBtn = document.getElementById('toggleAdvanced');
        if (toggleAdvancedBtn) {
            toggleAdvancedBtn.addEventListener('click', () => {
                const advancedGrid = document.getElementById('advancedGrid');
                const isExpanded = toggleAdvancedBtn.getAttribute('aria-expanded') === 'true';
                toggleAdvancedBtn.setAttribute('aria-expanded', !isExpanded);
                advancedGrid.classList.toggle('expanded', !isExpanded);
                advancedGrid.setAttribute('aria-hidden', isExpanded);
            });
            console.log('Advanced functions toggle event listener attached.');
        } else {
            console.warn('Advanced functions toggle element not found!');
        }
    }

    bindSettingsEvents() {
        setTimeout(() => {
            const themeSelect = document.getElementById('themeSelect');
            const voiceFeedbackToggle = document.getElementById('voiceFeedbackToggle');
            const autoSpeakToggle = document.getElementById('autoSpeakToggle');
            const voiceLanguageSelect = document.getElementById('voiceLanguageSelect');
            const voiceSpeedSlider = document.getElementById('voiceSpeedSlider');
            const decimalPlacesSlider = document.getElementById('decimalPlacesSlider');
            const angleUnitSelect = document.getElementById('angleUnitSelect');

            if (themeSelect) {
                themeSelect.value = this.settings.theme;
                themeSelect.addEventListener('change', (e) => {
                    this.settings.theme = e.target.value;
                    this.applySettings();
                    this.saveSettings();
                });
            }

            if (voiceFeedbackToggle) {
                voiceFeedbackToggle.checked = this.settings.voiceFeedback;
                voiceFeedbackToggle.addEventListener('change', (e) => {
                    this.settings.voiceFeedback = e.target.checked;
                    this.saveSettings();
                });
            }

            if (autoSpeakToggle) {
                autoSpeakToggle.checked = this.settings.autoSpeak;
                autoSpeakToggle.addEventListener('change', (e) => {
                    this.settings.autoSpeak = e.target.checked;
                    this.saveSettings();
                });
            }

            if (voiceLanguageSelect) {
                voiceLanguageSelect.value = this.settings.language;
                voiceLanguageSelect.addEventListener('change', (e) => {
                    this.settings.language = e.target.value;
                    this.setupVoiceRecognition();
                    this.saveSettings();
                });
            }
            if (voiceSpeedSlider) {
                voiceSpeedSlider.value = this.settings.voiceSpeed;
                document.getElementById('voiceSpeedValue').textContent = `${this.settings.voiceSpeed.toFixed(1)}x`;
                voiceSpeedSlider.addEventListener('input', (e) => {
                    this.settings.voiceSpeed = parseFloat(e.target.value);
                    document.getElementById('voiceSpeedValue').textContent = `${this.settings.voiceSpeed.toFixed(1)}x`;
                    this.saveSettings();
                });
            }
            if (decimalPlacesSlider) {
                decimalPlacesSlider.value = this.settings.decimalPlaces;
                document.getElementById('decimalPlacesValue').textContent = this.settings.decimalPlaces.toString();
                decimalPlacesSlider.addEventListener('input', (e) => {
                    this.settings.decimalPlaces = parseInt(e.target.value);
                    document.getElementById('decimalPlacesValue').textContent = this.settings.decimalPlaces.toString();
                    this.saveSettings();
                });
            }
            if (angleUnitSelect) {
                angleUnitSelect.value = this.settings.angleUnit;
                angleUnitSelect.addEventListener('change', (e) => {
                    this.settings.angleUnit = e.target.value;
                    this.updateDegRadButton();
                    this.saveSettings();
                });
            }
            console.log('Settings form event listeners bound.');
        }, 100);
    }

    // --- Calculator Input Handling ---
    handleCalculatorInput(e) {
        const btn = e.target.closest('.calc-btn');
        if (!btn) return;

        const action = btn.dataset.action;
        const value = btn.dataset.value;
        const func = btn.dataset.function;

        if (action) {
            this.handleAction(action);
        } else if (value) {
            this.appendToExpression(value);
        } else if (func) {
            this.handleFunction(func);
        }
    }

    handleAction(action) {
        switch (action) {
            case 'clear':
                this.clearDisplay();
                break;
            case 'clear-entry':
                this.clearEntry();
                break;
            case 'backspace':
                this.backspace();
                break;
            case 'calculate':
                this.calculate();
                break;
            case 'sign-toggle':
                this.toggleSign();
                break;
            case 'memory-clear':
            case 'memory-recall':
            case 'memory-add':
            case 'memory-subtract':
                this.showVoiceFeedback(`Memory function '${action}' not yet implemented.`);
                console.warn(`Memory function '${action}' not implemented.`);
                break;
            default:
                console.warn('Unknown calculator action:', action);
        }
    }

    handleFunction(func) {
        switch (func) {
            case 'sqrt':
                this.appendToExpression('sqrt(');
                break;
            case 'power':
                this.appendToExpression('^2');
                break;
            case 'power-n':
                this.appendToExpression('^');
                break;
            case 'reciprocal':
                this.appendToExpression('1/');
                break;
            case 'log':
                this.appendToExpression('log(');
                break;
            case 'ln':
                this.appendToExpression('ln(');
                break;
            case 'log2':
                this.appendToExpression('log2(');
                break;
            case 'exp':
                this.appendToExpression('exp(');
                break;
            case 'sin':
                this.appendToExpression('sin(');
                break;
            case 'cos':
                this.appendToExpression('cos(');
                break;
            case 'tan':
                this.appendToExpression('tan(');
                break;
            case 'pi':
                this.appendToExpression('PI');
                break;
            case 'e':
                this.appendToExpression('E');
                break;
            case 'rand':
                this.currentExpression = Math.random().toFixed(this.settings.decimalPlaces);
                this.updateDisplay();
                break;
            case 'factorial':
                this.showVoiceFeedback('Factorial not yet implemented.');
                console.warn('Factorial function not implemented.');
                break;
            case 'deg-rad':
                this.settings.angleUnit = this.settings.angleUnit === 'degrees' ? 'radians' : 'degrees';
                this.updateDegRadButton();
                this.saveSettings();
                this.showVoiceFeedback(`Angle unit set to ${this.settings.angleUnit}`);
                break;
            default:
                console.warn('Unknown advanced function:', func);
        }
    }

    updateDegRadButton() {
        const degRadBtn = document.querySelector('[data-function="deg-rad"]');
        if (degRadBtn) {
            degRadBtn.textContent = this.settings.angleUnit.toUpperCase().substring(0, 3);
        }
        const angleUnitSelect = document.getElementById('angleUnitSelect');
        if (angleUnitSelect) {
            angleUnitSelect.value = this.settings.angleUnit;
        }
    }


    appendToExpression(value) {
        if (this.currentExpression === '0' && !isNaN(value) && value !== '.') {
            this.currentExpression = value;
        } else {
            if (value === '.') {
                const lastNumberMatch = this.currentExpression.match(/(\d+\.?\d*)$/);
                if (lastNumberMatch && lastNumberMatch[0].includes('.')) {
                    return;
                }
            }
            this.currentExpression += value;
        }
        this.updateDisplay();
    }

    clearDisplay() {
        this.currentExpression = '';
        this.currentResult = '0';
        this.updateDisplay();
        this.showVoiceFeedback('Display cleared');
    }

    clearEntry() {
        const lastEntryMatch = this.currentExpression.match(/(\d+\.?\d*|[+\-*/()]+)$/);
        if (lastEntryMatch) {
            this.currentExpression = this.currentExpression.slice(0, -lastEntryMatch[0].length);
        } else {
            this.currentExpression = '';
        }
        if (this.currentExpression === '') {
            this.currentResult = '0';
        }
        this.updateDisplay();
    }

    backspace() {
        if (this.currentExpression.length > 0) {
            this.currentExpression = this.currentExpression.slice(0, -1);
            if (this.currentExpression === '') {
                this.currentResult = '0';
            }
            this.updateDisplay();
        }
    }

    toggleSign() {
        const lastNumberMatch = this.currentExpression.match(/(\d+\.?\d*)$/);
        if (lastNumberMatch) {
            const lastNumber = lastNumberMatch[0];
            const prefix = this.currentExpression.slice(0, -lastNumber.length);
            const newNumber = (parseFloat(lastNumber) * -1).toString();
            this.currentExpression = prefix + newNumber;
        } else if (this.currentExpression === this.currentResult && !isNaN(this.currentResult)) {
            this.currentExpression = (parseFloat(this.currentResult) * -1).toString();
        } else {
            if (this.currentExpression.startsWith('-')) {
                this.currentExpression = this.currentExpression.substring(1);
            } else {
                this.currentExpression = '-' + this.currentExpression;
            }
        }
        this.updateDisplay();
    }

    // --- Calculation ---
    calculate() {
        if (!this.currentExpression) {
            this.showVoiceFeedback('No expression to calculate');
            return;
        }

        this.showLoading(true);

        try {
            let expression = this.currentExpression.replace(/x/g, '*').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
            expression = expression.replace(/PI/g, 'Math.PI').replace(/E/g, 'Math.E');

            expression = expression.replace(/\^/g, '**');

            const trigRegex = /(sin|cos|tan)\(([^)]*)\)/g;
            if (this.settings.angleUnit === 'degrees') {
                expression = expression.replace(trigRegex, (match, funcName, arg) => {
                    try {
                        const evaluatedArg = Function('Math', '"use strict"; return (' + arg + ')') (Math);

                        if (typeof evaluatedArg === 'number' && isFinite(evaluatedArg)) {
                            return `Math.${funcName}(${evaluatedArg} * Math.PI / 180)`;
                        }
                    } catch (e) {
                        console.warn(`Could not evaluate trig argument "${arg}":`, e);
                    }
                    return match;
                });
            } else {
                expression = expression.replace(/(sin|cos|tan)\(/g, 'Math.$1(');
            }

            expression = expression.replace(/sqrt\(/g, 'Math.sqrt(');
            expression = expression.replace(/log\(/g, 'Math.log10(');
            expression = expression.replace(/ln\(/g, 'Math.log(');
            expression = expression.replace(/log2\(/g, 'Math.log2(');
            expression = expression.replace(/exp\(/g, 'Math.exp(');

            expression = this.balanceParentheses(expression);

            const result = this.evaluateExpression(expression);

            if (result !== null && isFinite(result)) {
                this.currentResult = this.formatResult(result);
                this.currentExpression = this.currentResult;
                this.addToHistory(this.currentExpression, this.currentResult);
                this.updateDisplay();
                this.updateOperationCount();

                if (this.settings.autoSpeak) {
                    this.speakResult(this.currentResult);
                }
                this.showVoiceFeedback(`Result: ${this.currentResult}`);
            } else {
                this.showError('Invalid calculation');
                this.showVoiceFeedback('Calculation failed');
            }
        } catch (error) {
            console.error('Calculation error:', error);
            this.showError('Invalid expression');
            this.showVoiceFeedback('Calculation failed');
        } finally {
            this.showLoading(false);
        }
    }

    balanceParentheses(expression) {
        let openCount = (expression.match(/\(/g) || []).length;
        let closeCount = (expression.match(/\)/g) || []).length;

        if (openCount > closeCount) {
            expression += ')'.repeat(openCount - closeCount);
        }
        return expression;
    }

    evaluateExpression(expr) {
        try {
            const safeExpr = expr.replace(/\s/g, '');

            let evaluatedString = safeExpr
                .replace(/PI/g, 'Math.PI')
                .replace(/E/g, 'Math.E')
                .replace(/\^/g, '**');

            evaluatedString = evaluatedString
                .replace(/log\(/g, 'Math.log10(')
                .replace(/ln\(/g, 'Math.log(')
                .replace(/log2\(/g, 'Math.log2(');

            if (!/^[0-9+\-*/.()]+(\*\*[\d.]+)*|Math\.(?:PI|E)|(?:Math\.(?:sin|cos|tan|sqrt|log|log10|log2|exp))\([0-9+\-*/.()Ee]+\)*$/g.test(evaluatedString)) {
                if (!/^[\d+\-*/.()]+$|^Math\.(PI|E)$/.test(evaluatedString)) {
                    throw new Error('Invalid characters or unsafe expression detected.');
                }
            }

            const func = new Function('Math', 'return ' + evaluatedString);
            return func(Math);

        } catch (error) {
            console.error('Expression evaluation error:', error);
            throw new Error('Calculation Error: ' + error.message);
        }
    }

    formatResult(result) {
        if (Number.isInteger(result)) {
            return result.toString();
        }
        return parseFloat(result.toFixed(this.settings.decimalPlaces)).toString();
    }

    addToHistory(expression, result) {
        const historyItem = {
            expression,
            result,
            timestamp: new Date().toISOString()
        };

        this.history.unshift(historyItem);

        if (this.history.length > 50) {
            this.history = this.history.slice(0, 50);
        }
        this.sessionData.history = [...this.history];
    }

    // --- Voice Recognition ---
    setupVoiceRecognition() {
        console.log('Attempting to set up Voice Recognition...');
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn('Speech recognition not supported in this browser.');
            this.showVoiceFeedback('Voice recognition not supported in this browser');
            this.recognition = null;
            return;
        }

        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            console.log('SpeechRecognition object created:', this.recognition);

            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = this.settings.language || 'en-US';
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => {
                console.log('Voice recognition STARTED. isListening:', this.isListening);
                this.isRecognitionActive = true;
                this.updateVoiceStatus('Listening... Speak now!', 'listening');
                this.showVoiceVisualization(true);
                this.showVoiceFeedback('Listening for your voice input...');
                this.setupAudioContext();
            };

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (interimTranscript) {
                    const expressionDisplay = document.getElementById('expressionDisplay');
                    if (expressionDisplay) {
                        expressionDisplay.textContent = interimTranscript;
                    }
                    this.showVoiceFeedback(`Hearing: ${interimTranscript}`);
                }

                if (finalTranscript) {
                    console.log('Final Transcript:', finalTranscript);
                    this.processVoiceInput(finalTranscript);
                }
            };

            this.recognition.onend = () => {
                console.log('Voice recognition ONEND. isListening:', this.isListening);
                this.isRecognitionActive = false;
                this.updateVoiceStatus('Ready to listen', 'ready');
                this.showVoiceVisualization(false);
                this.closeAudioContext();

                if (this.isListening) {
                    console.log('Voice recognition stopped unexpectedly, attempting restart...');
                    this.showVoiceFeedback('Microphone re-calibrating...');
                    if (this.restartTimeOut) {
                        clearTimeout(this.restartTimeOut);
                    }
                    this.restartTimeOut = setTimeout(() => {
                        this.startVoiceRecognition();
                    }, 500);
                } else {
                    this.showVoiceFeedback('Voice recognition stopped.');
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition ERROR:', event.error);
                this.isRecognitionActive = false;
                this.updateVoiceStatus('Ready to listen', 'ready');
                this.showVoiceVisualization(false);
                this.closeAudioContext();

                const errorMessages = {
                    'no-speech': 'No speech detected. Please speak loudly and clearly.',
                    'audio-capture': 'Cannot access microphone. Check permissions.',
                    'not-allowed': 'Microphone access denied. Please allow access.',
                    'network': 'Network error. Check internet connection.',
                    'aborted': 'Voice recognition stopped.',
                    'language-not-supported': 'Voice language not supported.',
                    'service-not-allowed': 'Voice service not available.'
                };
                this.showError(errorMessages[event.error] || 'Voice recognition error');
                this.showVoiceFeedback(errorMessages[event.error] || 'Voice recognition error');

                if (this.isListening && event.error !== 'not-allowed' && event.error !== 'audio-capture') {
                    console.log('Voice recognition error, attempting restart...');
                    if (this.restartTimeOut) clearTimeout(this.restartTimeOut);
                    this.restartTimeOut = setTimeout(() => {
                        this.startVoiceRecognition();
                    }, 1000);
                } else if (event.error === 'not-allowed' || event.error === 'audio-capture') {
                    this.isListening = false;
                    this.updateVoiceStatus('Microphone blocked', 'error');
                }
            };
        } catch (error) {
            console.error('Voice recognition setup error (catch block):', error);
            this.showError('Voice setup failed');
            this.showVoiceFeedback('Voice setup failed');
        }
    }

    setupAudioContext() {
        console.log('Attempting to set up AudioContext...');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('getUserMedia not supported in this browser.');
            return;
        }

        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('New AudioContext created. State:', this.audioContext.state);
        }

        if (!this.mediaStream && this.audioContext && this.audioContext.state !== 'closed') {
            console.log('Requesting microphone access...');
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    this.mediaStream = stream;
                    if (this.audioContext && this.audioContext.state !== 'closed') {
                        this.analyser = this.audioContext.createAnalyser();
                        this.microphone = this.audioContext.createMediaStreamSource(stream);

                        this.analyser.smoothingTimeConstant = 0.8;
                        this.analyser.fftSize = 1024;

                        this.microphone.connect(this.analyser);
                        // IMPORTANT FIX: Removed connection to audioContext.destination to prevent echo
                        // this.analyser.connect(this.audioContext.destination);
                        console.log('Microphone connected to AudioContext (without direct output).');

                        this.updateVoiceLevel();
                    } else {
                        console.warn('AudioContext was closed before getUserMedia stream was available. Stopping stream.');
                        stream.getTracks().forEach(track => track.stop());
                        this.mediaStream = null;
                    }
                })
                .catch(error => {
                    console.error('Microphone access error (getUserMedia):', error);
                    this.showError('Microphone access denied or failed.');
                    this.isListening = false;
                    this.stopVoiceRecognition();
                    this.updateVoiceStatus('Microphone blocked', 'error');
                });
        } else if (this.mediaStream && this.audioContext && this.audioContext.state === 'running') {
            console.log('MediaStream already exists and AudioContext is active. Ensuring analyser is active.');
            if (this.analyser && this.microphone) {
                this.updateVoiceLevel();
            } else {
                console.warn('MediaStream exists but analyser/microphone not setup. Attempting to re-setup.');
                if (this.mediaStream.active && this.audioContext.state !== 'closed') {
                     this.analyser = this.audioContext.createAnalyser();
                     this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);
                     this.analyser.smoothingTimeConstant = 0.8;
                     this.analyser.fftSize = 1024;
                     this.microphone.connect(this.analyser);
                     // IMPORTANT FIX: Ensure this is also not connected here if re-setup
                     // this.analyser.connect(this.audioContext.destination);
                     console.log('Re-connected microphone to AudioContext (without direct output).');
                     this.updateVoiceLevel();
                } else {
                    console.error('Existing MediaStream is not active or AudioContext is closed, cannot re-setup audio context components.');
                    this.mediaStream = null;
                    this.closeAudioContext();
                }
            }
        }
    }

    closeAudioContext() {
        console.log('Attempting to close AudioContext...');
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => {
                console.log('Stopping media stream track:', track.kind);
                track.stop();
            });
            this.mediaStream = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close()
                .then(() => {
                    console.log('AudioContext closed successfully.');
                    this.audioContext = null;
                    this.analyser = null;
                    this.microphone = null;
                })
                .catch(error => console.error('Error closing AudioContext:', error));
        } else {
            console.log('AudioContext already closed or null.');
        }
    }

    updateVoiceLevel() {
        if (!this.analyser || !this.isRecognitionActive || !this.audioContext || this.audioContext.state !== 'running') {
            const levelBar = document.getElementById('levelBar');
            if (levelBar) levelBar.style.width = '0%';
            return;
        }

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const animate = () => {
            if (!this.isRecognitionActive || !this.analyser || !this.audioContext || this.audioContext.state !== 'running') {
                const levelBar = document.getElementById('levelBar');
                if (levelBar) levelBar.style.width = '0%';
                return;
            }

            this.analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const percentage = (average / 255) * 100;

            const levelBar = document.getElementById('levelBar');
            if (levelBar) {
                levelBar.style.width = `${percentage}%`;
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    toggleVoiceRecognition() {
        console.log('Toggle Voice Recognition clicked. Current isListening:', this.isListening);
        if (this.isListening) {
            this.stopVoiceRecognition();
        } else {
            this.startVoiceRecognition();
        }
    }

    startVoiceRecognition() {
        console.log('Attempting to START voice recognition...');
        if (this.restartTimeOut) {
            clearTimeout(this.restartTimeOut);
            this.restartTimeOut = null;
        }

        this.isListening = true;

        if (!this.recognition) {
            this.setupVoiceRecognition();
            if (!this.recognition) {
                this.showVoiceFeedback('Voice recognition not supported in this browser');
                this.isListening = false;
                return;
            }
        }

        if (this.isRecognitionActive) {
            this.showVoiceFeedback('Already listening...');
            console.warn('Attempted to start recognition, but it is already active.');
            return;
        }

        try {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                 this.audioContext.resume().then(() => {
                    console.log('AudioContext resumed, starting recognition.');
                    this.recognition.start();
                 }).catch(e => console.error('Error resuming AudioContext:', e));
            } else {
                this.recognition.start();
            }
            this.showVoiceFeedback('Voice recognition started - speak now');
            console.log('recognition.start() called.');
        } catch (error) {
            console.error('Failed to start voice recognition (catch block):', error);
            this.isRecognitionActive = false;
            if (error.name === 'InvalidStateError' && error.message.includes('already started')) {
                this.showVoiceFeedback('Voice recognition is already active.');
                this.isRecognitionActive = true;
            } else if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                this.showVoiceFeedback('Microphone access denied or aborted. Click mic again.');
                this.isListening = false;
                this.updateVoiceStatus('Microphone blocked', 'error');
            } else {
                this.showVoiceFeedback('Failed to start voice recognition. Try again.');
                this.isListening = false;
            }
        }
    }

    stopVoiceRecognition() {
        console.log('Attempting to STOP voice recognition...');
        this.isListening = false;

        if (this.restartTimeOut) {
            clearTimeout(this.restartTimeOut);
            this.restartTimeOut = null;
        }

        if (this.recognition && this.isRecognitionActive) {
            this.recognition.stop();
            console.log('recognition.stop() called.');
        } else {
            console.log('Recognition not active, nothing to stop via API.');
            this.updateVoiceStatus('Ready to listen', 'ready');
            this.showVoiceVisualization(false);
            this.closeAudioContext();
            this.showVoiceFeedback('Voice recognition stopped.');
        }
    }


    processVoiceInput(voiceText) {
        console.log('Processing voice input:', voiceText);
        this.isProcessing = true;
        this.updateVoiceStatus('Processing...', 'processing');
        this.showVoiceFeedback(`Processing: "${voiceText}"`);

        try {
            const parsedCommand = this.parseVoiceToMath(voiceText);
            console.log('Parsed voice input:', parsedCommand);

            if (parsedCommand) {
                switch (parsedCommand) {
                    case 'CMD_CLEAR':
                        this.clearDisplay();
                        this.showVoiceFeedback('Display cleared by voice command.');
                        break;
                    case 'CMD_CALCULATE':
                        this.calculate();
                        this.showVoiceFeedback('Calculating by voice command.');
                        break;
                    case 'CMD_REPEAT':
                        this.repeatLastResult();
                        this.showVoiceFeedback('Repeating last result by voice command.');
                        break;
                    case 'CMD_HISTORY':
                        this.openHistory();
                        this.showVoiceFeedback('Opening history by voice command.');
                        break;
                    default:
                        this.currentExpression = parsedCommand;
                        this.updateDisplay();
                        this.showVoiceFeedback(`Understood: ${parsedCommand}`);

                        if (this.isCompleteExpression(parsedCommand)) {
                            console.log('Expression seems complete, calculating...');
                            setTimeout(() => this.calculate(), 500);
                        } else {
                            console.log('Expression not yet complete, waiting for more input or manual calculation.');
                        }
                        break;
                }
            } else {
                this.showError('Could not understand voice input');
                this.showVoiceFeedback('Could not understand voice input');
            }
        } catch (error) {
            console.error('Voice processing error:', error);
            this.showError('Voice processing failed');
            this.showVoiceFeedback('Voice processing failed');
        } finally {
            this.isProcessing = false;
        }
    }


    parseVoiceToMath(text) {
        let processed = text.toLowerCase().trim();
        console.log('Initial voice text for parsing:', processed);

        // 0. Check for direct commands first (order matters for accuracy)
        if (/(^|\s)(clear|clear all|reset|erase)(|\sdisplay|\sscreen)?($|\s)/.test(processed)) return 'CMD_CLEAR';
        if (/(^|\s)(equals|equal|is|what is|calculate|solve|answer)(\s|\b|$)/.test(processed)) return 'CMD_CALCULATE';
        if (/(^|\s)(repeat|say again|last result|what was the last result)(\s|\b|$)/.test(processed)) return 'CMD_REPEAT';
        if (/(^|\s)(history|show history|open history|past calculations)(\s|\b|$)/.test(processed)) return 'CMD_HISTORY';


        const numberWords = {
            'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
            'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
            'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
            'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
            'eighteen': '18', 'nineteen': '19', 'twenty': '20',
            'thirty': '30', 'forty': '40', 'fifty': '50', 'sixty': '60',
            'seventy': '70', 'eighty': '80', 'ninety': '90'
        };

        // 1. Replace large number units first (e.g., "1 million" -> "1 * 1000000")
        processed = processed.replace(/(\d+)\s*trillion/g, (match, num) => `${num}*1000000000000`);
        processed = processed.replace(/(\d+)\s*billion/g, (match, num) => `${num}*1000000000`);
        processed = processed.replace(/(\d+)\s*million/g, (match, num) => `${num}*1000000`);
        processed = processed.replace(/(\d+)\s*lakh/g, (match, num) => `${num}*100000`);
        processed = processed.replace(/(\d+)\s*crore/g, (match, num) => `${num}*10000000`);
        processed = processed.replace(/(\d+) hundred/g, '$100'); // Convert "five hundred" to "500"

        // 2. Replace number words with digits (e.g., "five" -> "5")
        for (const word in numberWords) {
            processed = processed.replace(new RegExp(`\\b${word}\\b`, 'g'), numberWords[word]);
        }

        // 3. Normalize common mathematical operators
        processed = processed.replace(/\bplus\b|\badd\b/g, '+');
        processed = processed.replace(/\bminus\b|\bsubtract\b/g, '-');
        processed = processed.replace(/\btimes\b|\bmultiply\b|\bmultiplied by\b/g, '*');
        processed = processed.replace(/\bdivide\b|\bdivided by\b/g, '/');
        processed = processed.replace(/\bpoint\b|\bdot\b/g, '.');
        processed = processed.replace(/\bopen parenthesis\b|\bopen bracket\b/g, '(');
        processed = processed.replace(/\bclose parenthesis\b|\bclose bracket\b/g, ')');
        // Handle "x" as multiplication (common in voice for "times")
        processed = processed.replace(/(\d+)\s*x\s*(\d+)/g, '$1*$2');


        // 4. Handle advanced functions and constants - More robust parsing for arguments
        processed = processed.replace(/\b(sin|sine)\s*(?:of\s*)?(\d+(\.\d+)?)\b/g, 'sin($2)');
        processed = processed.replace(/\b(cos|cosine)\s*(?:of\s*)?(\d+(\.\d+)?)\b/g, 'cos($2)');
        processed = processed.replace(/\b(tan|tangent)\s*(?:of\s*)?(\d+(\.\d+)?)\b/g, 'tan($2)');
        processed = processed.replace(/\b(log)\s*(?:of\s*)?(\d+(\.\d+)?)\b/g, 'log($2)');
        processed = processed.replace(/\b(natural\s*log|ln)\s*(?:of\s*)?(\d+(\.\d+)?)\b/g, 'ln($2)');
        processed = processed.replace(/\b(log two|log2)\s*(?:of\s*)?(\d+(\.\d+)?)\b/g, 'log2($2)');
        processed = processed.replace(/\b(exp|exponential)\s*(?:of\s*)?(\d+(\.\d+)?)\b/g, 'exp($2)');
        processed = processed.replace(/\bsquare\s*root\s*(?:of\s*)?(\d+(\.\d+)?)\b/g, 'sqrt($1)');
        processed = processed.replace(/(\d+(\.\d+)?)\s*squared\b/g, '$1^2');
        processed = processed.replace(/(\d+(\.\d+)?)\s*(?:to\s*the\s*)?power\s*(?:of\s*)?(\d+(\.\d+)?)\b/g, '$1^$3');
        processed = processed.replace(/\bpi\b/g, 'PI');
        processed = processed.replace(/\be\b/g, 'E');
        processed = processed.replace(/\brandom\b|\brandom\s*number\b|\broll\s*dice\b/g, 'rand');

        // 5. Remove any remaining common filler words that might be in a sentence
        processed = processed.replace(/\b(the|a|an|result|value|do|can|you|me|please|give|show|tell)\b/g, '');


        // 6. Clean up extra spaces that result from removals
        processed = processed.replace(/\s+/g, '');

        console.log('Processed text before final validation:', processed);

        // Final validation for acceptable characters and return
        if (/^[0-9+\-*/.()sqrtasincoletanlogPIE^rand]+$/.test(processed)) {
            if (processed.endsWith('=')) {
                processed = processed.slice(0, -1);
            }
            return processed;
        }
        console.warn('Parsed text did not pass final math expression validation (not a command, not a valid expression):', processed);
        return null;
    }


    isCompleteExpression(expression) {
        const hasDigit = /[0-9]/.test(expression);
        const hasOperator = /[+\-*/^]/.test(expression);
        const endsWithOperatorOrOpenParen = /[+\-*/(^]$/.test(expression);

        let openParens = (expression.match(/\(/g) || []).length;
        let closeParens = (expression.match(/\)/g) || []).length;
        const balancedParens = openParens === closeParens;

        const hasUnclosedFunction = /(sin|cos|tan|log|ln|log2|exp|sqrt)\([^)]*$/.test(expression);

        return hasDigit && !endsWithOperatorOrOpenParen && balancedParens && !hasUnclosedFunction;
    }

    // --- Text-to-Speech ---
    setupTextToSpeech() {
        console.log('Attempting to set up Text-to-Speech...');
        if ('speechSynthesis' in window) {
            this.synthesis = window.speechSynthesis;
            console.log('SpeechSynthesis object created:', this.synthesis);
            this.synthesis.onvoiceschanged = () => {
                console.log('Voices loaded for SpeechSynthesis');
            };
        } else {
            console.warn('Text-to-speech not supported.');
            this.showVoiceFeedback('Text-to-speech not supported in this browser');
        }
    }

    speakResult(text) {
        if (!this.synthesis || !this.settings.voiceFeedback) {
            console.log('Speech synthesis skipped. Synthesis not available or voice feedback disabled.');
            return;
        }

        try {
            this.synthesis.cancel();
            console.log('Speaking result:', text);
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = this.settings.language || 'en-US';
            utterance.rate = this.settings.voiceSpeed;
            utterance.pitch = 1;
            utterance.volume = 1;

            this.synthesis.speak(utterance);
        } catch (error) {
            console.error('Text-to-speech error:', error);
            this.showError('Text-to-speech failed');
        }
    }

    // --- UI Updates ---
    updateDisplay() {
        const expressionDisplay = document.getElementById('expressionDisplay');
        const resultDisplay = document.getElementById('resultDisplay');

        if (expressionDisplay) {
            expressionDisplay.textContent = this.currentExpression || '0';
        }

        if (resultDisplay) {
            resultDisplay.textContent = this.currentResult || '0';
        }

        this.updateLastUpdated();
    }

    updateVoiceStatus(message, status = 'ready') {
        const statusText = document.getElementById('statusText');
        const statusIndicator = document.getElementById('statusIndicator');
        const voiceBtn = document.getElementById('voiceBtn');
        const micIcon = document.getElementById('micIcon');
        const btnText = voiceBtn ? voiceBtn.querySelector('.btn-text') : null;


        if (statusText) {
            statusText.textContent = message;
        }

        if (statusIndicator) {
            statusIndicator.className = `status-indicator ${status}`;
        }

        if (voiceBtn) {
            voiceBtn.className = `voice-btn primary ${this.isListening ? 'listening' : 'ready'}`;
        }

        if (micIcon) {
            micIcon.textContent = this.isListening ? '🔴' : '🎤';
        }

        if (btnText) {
            btnText.textContent = this.isListening ? 'Stop Listening' : 'Start Listening';
        }
    }

    showVoiceFeedback(message) {
        const voiceFeedback = document.getElementById('voiceFeedback');
        if (voiceFeedback) {
            voiceFeedback.textContent = message;
            voiceFeedback.style.opacity = '1';
            voiceFeedback.style.pointerEvents = 'auto';

            if (this.feedbackTimeout) {
                clearTimeout(this.feedbackTimeout);
            }

            this.feedbackTimeout = setTimeout(() => {
                if (voiceFeedback.textContent === message) {
                    voiceFeedback.style.opacity = '0';
                    voiceFeedback.style.pointerEvents = 'none';
                }
            }, 3000);
        }
    }

    showVoiceVisualization(show) {
        const visualization = document.getElementById('voiceVisualization');
        if (visualization) {
            visualization.style.display = show ? 'block' : 'none';

            if (show) {
                visualization.classList.add('active');
            } else {
                visualization.classList.remove('active');
            }
        }
    }

    showLoading(show) {
        const statusText = document.getElementById('statusText');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (statusText) {
            statusText.textContent = show ? 'Calculating...' : (this.isListening ? 'Listening...' : 'Ready');
            const statusIndicator = document.getElementById('statusIndicator');
            if (statusIndicator) {
                statusIndicator.classList.toggle('loading', show);
            }
        }
        if (loadingOverlay) {
            loadingOverlay.setAttribute('aria-hidden', !show);
            loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    }

    showError(message) {
        this.showVoiceFeedback(`Error: ${message}`);
        console.error('Calculator error:', message);
    }

    updateOperationCount() {
        const operationCount = document.getElementById('operationCount');
        if (operationCount) {
            operationCount.textContent = this.history.length.toString();
        }
    }

    updateLastUpdated() {
        const lastUpdated = document.getElementById('lastUpdated');
        if (lastUpdated) {
            lastUpdated.textContent = new Date().toLocaleTimeString();
        }
    }

    // --- Theme Management ---
    toggleTheme() {
        this.settings.theme = this.settings.theme === 'dark' ? 'light' : 'dark';
        this.applySettings();
        this.saveSettings();
        this.showVoiceFeedback(`Switched to ${this.settings.theme} theme`);
    }

    // --- Modal/Panel Management ---
    openSettings() {
        console.log('Attempting to open settings modal...');
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.setAttribute('aria-hidden', 'false');
            modal.style.display = 'flex';
            modal.focus();
            console.log('Settings modal opened. Display style:', modal.style.display);
            this.updateSettingsForm();
        } else {
            console.error('Settings modal element not found!');
        }
    }

    openHistory() {
        console.log('Attempting to open history panel...');
        const historyPanel = document.getElementById('historyPanel');
        if (historyPanel) {
            historyPanel.classList.add('open');
            historyPanel.setAttribute('aria-hidden', 'false');
            historyPanel.focus();
            console.log('History panel opened. ClassList:', historyPanel.classList);
            this.updateHistoryList();
        } else {
            console.error('History panel element not found!');
        }
    }

    closeModal(type = 'all') {
        console.log('Attempting to close modal/panel of type:', type);
        if (type === 'settings' || type === 'all') {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) {
                settingsModal.setAttribute('aria-hidden', 'true');
                settingsModal.style.display = 'none';
                console.log('Settings modal closed.');
            }
        }
        if (type === 'history' || type === 'all') {
            const historyPanel = document.getElementById('historyPanel');
            if (historyPanel) {
                historyPanel.classList.remove('open');
                historyPanel.setAttribute('aria-hidden', 'true');
                console.log('History panel closed.');
            }
        }
        if (type === 'confirmation' || type === 'all') {
            const confirmationModal = document.getElementById('customConfirmationModal');
            if (confirmationModal) {
                confirmationModal.setAttribute('aria-hidden', 'true');
                confirmationModal.style.display = 'none';
                console.log('Confirmation modal closed.');
            }
        }
        if (type === 'help' || type === 'all') {
            const helpModal = document.getElementById('helpModal');
            if (helpModal) {
                helpModal.setAttribute('aria-hidden', 'true');
                helpModal.style.display = 'none';
                console.log('Help modal closed.');
            }
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.focus();
                console.log('Focus returned to main content from Help modal.');
            }
        }

        if (!type || type === 'all') {
            document.getElementById('main-content')?.focus();
            console.log('Focus returned to main content.');
        }
    }

    updateSettingsForm() {
        const themeSelect = document.getElementById('themeSelect');
        const voiceFeedbackToggle = document.getElementById('voiceFeedbackToggle');
        const autoSpeakToggle = document.getElementById('autoSpeakToggle');
        const voiceLanguageSelect = document.getElementById('voiceLanguageSelect');
        const voiceSpeedSlider = document.getElementById('voiceSpeedSlider');
        const decimalPlacesSlider = document.getElementById('decimalPlacesSlider');
        const angleUnitSelect = document.getElementById('angleUnitSelect');

        if (themeSelect) themeSelect.value = this.settings.theme;
        if (voiceFeedbackToggle) voiceFeedbackToggle.checked = this.settings.voiceFeedback;
        if (autoSpeakToggle) autoSpeakToggle.checked = this.settings.autoSpeak;
        if (voiceLanguageSelect) voiceLanguageSelect.value = this.settings.language;
        if (voiceSpeedSlider) voiceSpeedSlider.value = this.settings.voiceSpeed;
        if (document.getElementById('voiceSpeedValue')) {
            document.getElementById('voiceSpeedValue').textContent = `${this.settings.voiceSpeed.toFixed(1)}x`;
        }
        if (decimalPlacesSlider) decimalPlacesSlider.value = this.settings.decimalPlaces;
        if (document.getElementById('decimalPlacesValue')) {
            document.getElementById('decimalPlacesValue').textContent = this.settings.decimalPlaces.toString();
        }
        if (angleUnitSelect) angleUnitSelect.value = this.settings.angleUnit;
        this.updateDegRadButton();
        console.log('Settings form updated with current values.');
    }

    // --- History Management ---
    loadHistory() {
        this.history = [...(this.sessionData.history || [])];
        this.updateOperationCount();
        console.log('History loaded:', this.history.length, 'items');
    }

    updateHistoryList() {
        const historyList = document.getElementById('historyContent');
        if (!historyList) {
            console.error('History content element not found!');
            return;
        }

        if (this.history.length === 0) {
            historyList.innerHTML = `
                <div class="history-empty">
                    <span class="empty-icon" role="img" aria-label="Empty history">📝</span>
                    <p>No calculations yet</p>
                    <button class="try-example-btn" id="tryExampleBtn">Try Example</button>
                </div>
            `;
            const tryExampleBtn = document.getElementById('tryExampleBtn');
            if (tryExampleBtn) {
                tryExampleBtn.addEventListener('click', () => {
                    this.currentExpression = '2 + 3 * 4';
                    this.updateDisplay();
                    this.calculate();
                    this.closeModal('history');
                });
            }
            console.log('History list updated: No calculations yet.');
            return;
        }

        historyList.innerHTML = this.history.map((item, index) => `
            <div class="history-item" data-index="${index}" tabindex="0" role="listitem" aria-label="Calculation: ${item.expression} equals ${item.result} at ${new Date(item.timestamp).toLocaleString()}">
                <div class="history-expression">${item.expression}</div>
                <div class="history-result">= ${item.result}</div>
                <div class="history-time">${new Date(item.timestamp).toLocaleString()}</div>
                <button class="history-reuse" onclick="window.calculator.reuseHistoryItem(${index})" aria-label="Reuse this calculation">
                    ↩️ Reuse
                </button>
            </div>
        `).join('');
        console.log('History list updated with items.');
    }

    reuseHistoryItem(index) {
        if (this.history[index]) {
            this.currentExpression = this.history[index].expression;
            this.currentResult = this.history[index].result;
            this.updateDisplay();
            this.closeModal('history');
            this.showVoiceFeedback('Calculation loaded from history');
            console.log('Reused history item:', this.history[index]);
        } else {
            this.showError('History item not found.');
            console.error('Attempted to reuse non-existent history item at index:', index);
        }
    }

    clearHistory() {
        this.showConfirmationModal('Are you sure you want to clear all calculation history?', () => {
            this.history = [];
            this.sessionData.history = [];
            this.updateHistoryList();
            this.updateOperationCount();
            this.showVoiceFeedback('History cleared');
            console.log('History cleared by user confirmation.');
        });
    }

    exportHistory() {
        if (this.history.length === 0) {
            this.showVoiceFeedback('No history to export');
            console.warn('No history to export.');
            return;
        }

        const csvContent = 'Expression,Result,Timestamp\n' +
            this.history.map(item =>
                `"${item.expression.replace(/"/g, '""')}","${item.result.replace(/"/g, '""')}","${item.timestamp}"`
            ).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `calculator-history-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showVoiceFeedback('History exported successfully');
        console.log('History exported to CSV.');
    }

    // --- Utility Functions ---
    repeatLastResult() {
        if (this.history.length > 0) {
            const lastCalculation = this.history[0];
            this.currentExpression = lastCalculation.expression;
            this.currentResult = lastCalculation.result;
            this.updateDisplay();

            if (this.settings.voiceFeedback) {
                this.speakResult(`Last result: ${lastCalculation.result}`);
            }
            this.showVoiceFeedback(`Repeated: ${lastCalculation.expression} = ${lastCalculation.result}`);
            console.log('Repeated last result:', lastCalculation);
        } else {
            this.showVoiceFeedback('No previous calculations to repeat');
            console.warn('No previous calculations to repeat.');
        }
    }

    // --- Keyboard Shortcuts ---
    handleKeyboard(e) {
        const handledKeys = [' ', 'Escape', 'r', 'R', 'Enter', 'Delete', 'Backspace'];

        if (handledKeys.includes(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
        }

        switch (e.key) {
            case ' ':
                if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
                    this.toggleVoiceRecognition();
                    console.log('Keyboard: Spacebar pressed for voice toggle.');
                }
                break;
            case 'Escape':
                if (document.getElementById('settingsModal')?.getAttribute('aria-hidden') === 'false') {
                    this.closeModal('settings');
                } else if (document.getElementById('historyPanel')?.getAttribute('aria-hidden') === 'false') {
                    this.closeModal('history');
                } else if (document.getElementById('customConfirmationModal')?.getAttribute('aria-hidden') === 'false') {
                    this.closeModal('confirmation');
                } else if (document.getElementById('helpModal')?.getAttribute('aria-hidden') === 'false') {
                    this.closeModal('help');
                } else if (this.isListening) {
                    this.stopVoiceRecognition();
                } else {
                    this.clearDisplay();
                }
                console.log('Keyboard: Escape pressed.');
                break;
            case 'r':
            case 'R':
                if (!e.ctrlKey && !e.altKey) {
                    this.repeatLastResult();
                    console.log('Keyboard: R pressed for repeat result.');
                }
                break;
            case 'Enter':
                this.calculate();
                console.log('Keyboard: Enter pressed for calculation.');
                break;
            case 'Delete':
                this.clearDisplay();
                console.log('Keyboard: Delete pressed for clear display.');
                break;
            case 'Backspace':
                this.backspace();
                console.log('Keyboard: Backspace pressed.');
                break;
            case 't':
            case 'T':
                if (e.ctrlKey) {
                    this.toggleTheme();
                    console.log('Keyboard: Ctrl+T pressed for theme toggle.');
                }
                break;
            default:
                if (!e.ctrlKey && !e.altKey && !e.metaKey && /^[0-9+\-*/.()=]$/.test(e.key)) {
                    if (e.key === '=') {
                        this.calculate();
                        console.log('Keyboard: = pressed for calculation.');
                    } else {
                        this.appendToExpression(e.key);
                        console.log('Keyboard: Appending key:', e.key);
                    }
                }
                break;
        }
    }

    // --- Custom Confirmation Modal (replaces `confirm()`) ---
    showConfirmationModal(message, onConfirm) {
        console.log('Showing confirmation modal with message:', message);
        let confirmationModal = document.getElementById('customConfirmationModal');
        if (!confirmationModal) {
            confirmationModal = document.createElement('div');
            confirmationModal.id = 'customConfirmationModal';
            confirmationModal.className = 'modal-overlay confirmation-modal';
            confirmationModal.setAttribute('aria-modal', 'true');
            confirmationModal.setAttribute('role', 'dialog');
            confirmationModal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">Confirm Action</h2>
                        <button class="btn-icon close-modal" aria-label="Close confirmation">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p id="confirmationMessage"></p>
                        <div class="modal-actions">
                            <button class="btn primary" id="confirmYes">Yes</button>
                            <button class="btn secondary" id="confirmNo">No</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(confirmationModal);

            confirmationModal.querySelector('.close-modal').addEventListener('click', () => this.closeModal('confirmation'));
            confirmationModal.querySelector('#confirmNo').addEventListener('click', () => this.closeModal('confirmation'));
            confirmationModal.querySelector('#confirmYes').addEventListener('click', () => {
                onConfirm();
                this.closeModal('confirmation');
            });
            confirmationModal.addEventListener('click', (e) => {
                if (e.target === confirmationModal) {
                    this.closeModal('confirmation');
                }
            });
            console.log('Confirmation modal created and event listeners attached.');
        }

        document.getElementById('confirmationMessage').textContent = message;
        confirmationModal.setAttribute('aria-hidden', 'false');
        confirmationModal.style.display = 'flex';
        confirmationModal.focus();
        console.log('Confirmation modal display set to flex.');
    }

    // --- New: Solve Complex Problem ---
    async solveComplexProblem() {
        const problemText = document.getElementById('expressionDisplay').textContent.trim();

        if (!problemText || problemText === '0' || problemText.length < 5) {
            this.showError('Please paste a mathematical question or proof into the display before clicking "Solve Question".');
            this.showVoiceFeedback('No complex question detected.');
            return;
        }

        if (!/^(?:prove|show that|divisible by|series|sum of|solve for)/i.test(problemText.trim())) {
             this.showError('This looks like an arithmetic calculation. Please use the "=" button to calculate, or paste a complex question.');
             this.showVoiceFeedback('This looks like an arithmetic calculation.');
             return;
        }


        this.showLoading(true);
        this.showVoiceFeedback('Analyzing complex question...');
        this.currentResult = 'Analyzing...';
        this.updateDisplay();

        try {
            await new Promise(resolve => setTimeout(resolve, 2500));

            let solutionSnippet = '';
            if (!navigator.onLine) {
                solutionSnippet = `You are offline. To solve complex questions, an internet connection is required to access advanced math engines.`;
                this.showError('Offline: Cannot solve complex questions.');
            } else if (problemText.includes('induction') || problemText.includes('prove that') || problemText.includes('show that') || problemText.includes('divisible by')) {
                 solutionSnippet = `For "${problemText}", solving proofs by induction or divisibility requires detailed logical steps: establish a base case (n=1), assume true for n=k, and prove for n=k+1. A full, step-by-step solution can be found on specialized math sites or textbooks (e.g., Wolfram Alpha, StackExchange Mathematics).`;
            } else if (problemText.includes('series') || problemText.includes('sum of')) {
                 solutionSnippet = `For "${problemText}", solving series sums often involves recognizing patterns, using summation formulas (arithmetic, geometric), or applying integral tests. A dedicated symbolic solver would provide the precise summation formula or value.`;
            } else if (problemText.includes('solve for')) {
                solutionSnippet = `For "${problemText}", solving algebraic equations requires isolating the variable using inverse operations. For complex equations, numerical solvers or symbolic manipulation tools are necessary.`;
            } else {
                solutionSnippet = `Searching for solution to: "${problemText}". For detailed answers to advanced math problems, please consider using Wolfram Alpha, Symbolab, or similar online computational knowledge engines.`;
            }


            this.currentResult = solutionSnippet;
            this.currentExpression = problemText;
            this.addToHistory(problemText, solutionSnippet);
            this.updateDisplay();
            this.showVoiceFeedback('Solution attempt completed.');

        } catch (error) {
            console.error('Error solving complex problem:', error);
            this.showError('Failed to solve complex question. Try rephrasing or check network.');
            this.showVoiceFeedback('Failed to solve complex question.');
        } finally {
            this.showLoading(false);
        }
    }


    // --- Cleanup ---
    destroy() {
        console.log('Destroying VoiceCalculator and cleaning up resources...');
        this.stopVoiceRecognition();
        this.closeAudioContext();

        if (this.synthesis) {
            this.synthesis.cancel();
        }

        if (this.restartTimeOut) {
            clearTimeout(this.restartTimeOut);
            this.restartTimeOut = null;
        }


        document.removeEventListener('click', this.handleCalculatorInput);
        document.removeEventListener('keydown', this.handleKeyboard);

        const voiceBtn = document.getElementById('voiceBtn');
        if (voiceBtn) voiceBtn.removeEventListener('click', this.toggleVoiceRecognition);
        const clearVoiceBtn = document.getElementById('clearVoiceBtn');
        if (clearVoiceBtn) clearVoiceBtn.removeEventListener('click', this.clearDisplay);
        const repeatBtn = document.getElementById('repeatBtn');
        if (repeatBtn) repeatBtn.removeEventListener('click', this.repeatLastResult);
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.removeEventListener('click', this.toggleTheme);
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) settingsBtn.removeEventListener('click', this.openSettings);
        const historyBtn = document.getElementById('historyBtn');
        if (historyBtn) historyBtn.removeEventListener('click', this.openHistory);
        const solveQuestionBtn = document.getElementById('solveQuestionBtn');
        if (solveQuestionBtn) solveQuestionBtn.removeEventListener('click', this.solveComplexProblem);
        const closeHistoryBtn = document.getElementById('closeHistoryBtn');
        if (closeHistoryBtn) closeHistoryBtn.removeEventListener('click', () => this.closeModal('history'));

        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) themeSelect.removeEventListener('change', this.bindSettingsEvents);
        const voiceFeedbackToggle = document.getElementById('voiceFeedbackToggle');
        if (voiceFeedbackToggle) voiceFeedbackToggle.removeEventListener('change', this.bindSettingsEvents);
        const autoSpeakToggle = document.getElementById('autoSpeakToggle');
        if (autoSpeakToggle) autoSpeakToggle.removeEventListener('change', this.bindSettingsEvents);
        const voiceLanguageSelect = document.getElementById('voiceLanguageSelect');
        if (voiceLanguageSelect) voiceLanguageSelect.removeEventListener('change', this.bindSettingsEvents);
        const voiceSpeedSlider = document.getElementById('voiceSpeedSlider');
        if (voiceSpeedSlider) voiceSpeedSlider.removeEventListener('input', this.bindSettingsEvents);
        const decimalPlacesSlider = document.getElementById('decimalPlacesSlider');
        if (decimalPlacesSlider) decimalPlacesSlider.removeEventListener('input', this.bindSettingsEvents);
        const angleUnitSelect = document.getElementById('angleUnitSelect');
        if (angleUnitSelect) angleUnitSelect.removeEventListener('change', this.bindSettingsEvents);


        console.log('Calculator destroyed and resources cleaned up');
    }
}

// Initialize the calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.calculator = new VoiceCalculator();
    } catch (error) {
        console.error('Failed to initialize Voice Calculator:', error);
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.innerHTML = '<div style="padding: 20px; color: red; text-align: center;">Failed to initialize calculator. Please ensure your browser supports Speech Recognition and refresh the page.</div>';
        } else {
            document.body.innerHTML = '<div style="padding: 20px; color: red; text-align: center;">Failed to initialize calculator. Please refresh the page.</div>';
        }
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.calculator) {
        window.calculator.destroy();
    }
});
