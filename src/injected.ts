import { defaultSettings } from './helpers/chromeSettings';

const settingsUrl = chrome.runtime.getURL('settings.json');
var request = new XMLHttpRequest();
request.open('GET', settingsUrl, false);
request.send(null);

export const settingsValue: string = request.responseText || JSON.stringify(defaultSettings);

export const injected = /*javascript*/ `
{
    // send message to the devtools panel
    const sendMessage = (type, value) => {
        window.postMessage({
            untrustedTypes: true,
            type,
            value
        }, '*');
    };

    let settings = ${settingsValue};

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message.untrustedTypes) return;
        if (message.type === 'settingsChanged') {
            settings = message.value;
        }
    });
    sendMessage('getSettings');

    let index = 0;
    let _open = open;
    open = function () {
        log(arguments[0], 0, 'Window open');
        return _open.apply(window, arguments);
    };
    const scopeId = Math.random().toString(36).substr(2, 2);
    
    function tryHTMLSanitization(input, type, sink) {
        if (type !== "TrustedHTML") {
            return {};
        }
        let domPurifyInput = null;
        let sanitizerInput = null;

        // Try DOMPurify
        if (typeof DOMPurify !== 'undefined') {
            const sanitized = DOMPurify.sanitize(input, {RETURN_TRUESTED_TYPES: true});
            domPurifyInput = sanitized.toString();
        }
        
        // Try native sanitizer.
        const e = document.createElement('div');
        if (e.setHTML) { // Sanitizer exists.
            e.setHTML(input);
            sanitizerInput = e.innerHTML.toString();
        }

        return {domPurifyInput, sanitizerInput};
    }

    function log(input, type, sink) {
        // ignore new events if recording has been disabled
        if(!settings.recordingEnabled) return input;

        // normalize input
        let inputLog = input;
        inputLog ??= '';
        inputLog = String(inputLog);

        const openGroup = () => {
            if (index === 0 && settings.groupMessagesInConsole) {
                if (top === self) {
                    console.groupCollapsed('[#' + scopeId + '-*] Untrusted Types: ' + location.href);
                }
            }
        };

        const stackId = scopeId + '-' + index + '-' + Math.random().toString(36).substr(2, 5);
        const errorStack = new Error().stack;

        let highlightedInput = inputLog;
        let important = false;
        const extraArgs = [];
        for (const keyword of settings.keywords) {
            if (keyword.length > 1 && inputLog.includes(keyword)) {
                highlightedInput = highlightedInput.replaceAll(keyword, '%c$&%c');
                important = true;
                for (let i = 0; i < inputLog.split(keyword).length - 1; i++) {
                    extraArgs.push('color: red; border: 1px dotted red; background: yellow;');
                    extraArgs.push('color: unset; border: reset; background: unset;');
                }
            }
        }

        if (important) {
            const args = [
                '#' + stackId + ' ' + location.href + '\\n%c' + sink + '\\n%c' + highlightedInput,
                'background: red; color: white; font-size: 16px',
                'background: unset; color: unset; font-size: unset;',
                ...extraArgs
            ];

            openGroup();
            let sanitizerOutput = tryHTMLSanitization(input, type, sink);
            sendMessage('sinkFound', { href: location.href, sink, input: inputLog, stack: errorStack, stackId, ...sanitizerOutput});
            index++;
            console.trace(...args);

        } else if (!settings.onlyLogHighlighted) {
            const stackTraceSplit = errorStack.split('\\n');

            if (settings.traceLimit && stackTraceSplit.length > settings.traceLimit) return input;

            let ignored = false;
            for (const ignoredSource of settings.ignored) {
                if (ignoredSource.length > 1 && errorStack.includes(ignoredSource)) {
                    ignored = true;
                    break;
                }
            }

            const stackTraceLastLine = stackTraceSplit[stackTraceSplit.length - 1];
            for (const ignoredSourceIfFirst of settings.ignoredIfFirst) {
                if (ignoredSourceIfFirst.length > 1 && stackTraceLastLine.includes(ignoredSourceIfFirst)) {
                    ignored = true;
                    break;
                }
            }

            if (!ignored) {
                openGroup();
                console.trace('#' + stackId + ' ' + location.href + '\\n%c' + sink, 'background: #222; color: #bada55; font-size: 16px', '\\n' + inputLog);
                let sanitizerOutput = tryHTMLSanitization(input, type, sink);
                sendMessage('sinkFound', { href: location.href, sink, input: inputLog, stack: errorStack, stackId, ...sanitizerOutput});
                index++;
            }
        }
        return input;
    }
    let trustedTypesEnabled;
    if (!trustedTypes.defaultPolicy) {
        trustedTypes.createPolicy('default', {
            createHTML: log,
            createScript: log,
            createScriptURL: log
        });
        trustedTypesEnabled = false;
    } else {
        console.warn('One or more documents are using Trusted Types. Untrusted Types is disabled.');
        trustedTypesEnabled = true;
    }
    if (top === self) {
        console.groupEnd();
        sendMessage('pageNavigation', { href: location.href, trustedTypesEnabled });
    }
}
//@ sourceURL=UNTRUSTED_TYPES_CHECK_STACK_BELOW
`;
