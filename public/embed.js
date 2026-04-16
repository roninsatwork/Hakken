// Sonae Widget Embed Script
// Minimal vanilla JS to inject the interactive Iframe without conflicting with the host website.

(function() {
    // Prevent double execution
    if (window.SonaeWidgetInitialized) return;
    window.SonaeWidgetInitialized = true;

    // Locate the script tag that loaded this script to extract the Widget ID
    let scriptTag = document.currentScript;
    let widgetId = scriptTag ? scriptTag.getAttribute('data-widget-id') : null;

    if (!widgetId) {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const id = scripts[i].getAttribute('data-widget-id');
            if (id) {
                scriptTag = scripts[i];
                widgetId = id;
                break;
            }
        }
    }

    if (!widgetId) {
        console.error("Sonae Widget: Missing data-widget-id attribute on the script tag.");
        return;
    }

    // Determine Host Path (allows local testing vs production)
    const hostUrl = scriptTag ? scriptTag.src.split('/embed.js')[0] : window.location.origin;

    // Inject Base CSS
    const style = document.createElement('style');
    style.innerHTML = `
        #sonae-widget-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 16px;
            pointer-events: none; /* Let clicks pass through container */
        }

        #sonae-widget-iframe-wrapper {
            width: 380px;
            height: 600px;
            max-height: calc(100vh - 100px);
            background: transparent;
            border-radius: 24px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.15);
            transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            opacity: 0;
            transform: translateY(20px) scale(0.95);
            visibility: hidden;
            pointer-events: auto;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.1);
        }

        #sonae-widget-iframe-wrapper.sonae-open {
            opacity: 1;
            transform: translateY(0) scale(1);
            visibility: visible;
        }

        #sonae-widget-iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
        }

        #sonae-widget-button {
            width: 60px;
            height: 60px;
            border-radius: 30px;
            background: #111; /* Fallback */
            color: #fff;
            border: none;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            cursor: pointer;
            pointer-events: auto;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #sonae-widget-button:hover {
            transform: scale(1.05);
            box-shadow: 0 12px 32px rgba(0,0,0,0.3);
        }

        .sonae-widget-icon {
            width: 24px;
            height: 24px;
            transition: opacity 0.2s ease, transform 0.2s ease;
            position: absolute;
        }

        .sonae-icon-chat { opacity: 1; transform: scale(1) rotate(0deg); }
        .sonae-icon-close { opacity: 0; transform: scale(0.5) rotate(-90deg); }

        #sonae-widget-button.sonae-open .sonae-icon-chat { opacity: 0; transform: scale(0.5) rotate(90deg); }
        #sonae-widget-button.sonae-open .sonae-icon-close { opacity: 1; transform: scale(1) rotate(0deg); }

        @media (max-width: 480px) {
            #sonae-widget-iframe-wrapper {
                width: calc(100vw - 48px);
                height: calc(100vh - 120px);
            }
        }
    `;
    document.head.appendChild(style);

    // Create Container
    const container = document.createElement('div');
    container.id = 'sonae-widget-container';

    // Create Iframe Wrapper
    const iframeWrapper = document.createElement('div');
    iframeWrapper.id = 'sonae-widget-iframe-wrapper';

    // Build Iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'sonae-widget-iframe';
    iframe.src = `${hostUrl}/w/${widgetId}`;
    iframe.allow = "microphone";
    iframeWrapper.appendChild(iframe);

    // Create Toggle Button
    const button = document.createElement('button');
    button.id = 'sonae-widget-button';
    button.setAttribute('aria-label', 'Toggle Chat');
    
    // SVG Icons
    button.innerHTML = `
        <svg class="sonae-widget-icon sonae-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <svg class="sonae-widget-icon sonae-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    `;

    // Manage State
    let isOpen = false;
    button.addEventListener('click', () => {
        isOpen = !isOpen;
        if (isOpen) {
            iframeWrapper.classList.add('sonae-open');
            button.classList.add('sonae-open');
            
            // Post message to iframe to focus input if needed
            iframe.contentWindow.postMessage({ type: 'WIDGET_OPENED' }, '*');
        } else {
            iframeWrapper.classList.remove('sonae-open');
            button.classList.remove('sonae-open');
        }
    });

    // Assemble DOM
    container.appendChild(iframeWrapper);
    container.appendChild(button);
    document.body.appendChild(container);

})();
