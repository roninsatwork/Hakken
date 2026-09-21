// Hakken Widget Embed Script
// Minimal vanilla JS to inject the interactive Iframe without conflicting with the host website.

(function() {
    // Prevent double execution
    if (window.HakkenWidgetInitialized) return;
    window.HakkenWidgetInitialized = true;

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
        console.error("Hakken Widget: Missing data-widget-id attribute on the script tag.");
        return;
    }

    // Determine Host Path (allows local testing vs production)
    const hostUrl = scriptTag ? scriptTag.src.split('/embed.js')[0] : window.location.origin;

    // Inject Base CSS
    const style = document.createElement('style');
    style.innerHTML = `
        #hakken-widget-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 16px;
            pointer-events: none;
        }

        #hakken-widget-iframe-wrapper {
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

        #hakken-widget-iframe-wrapper.hakken-open {
            opacity: 1;
            transform: translateY(0) scale(1);
            visibility: visible;
        }

        #hakken-widget-iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
        }

        #hakken-widget-button-container {
            position: relative;
            pointer-events: auto;
        }

        #hakken-widget-button {
            width: 60px;
            height: 60px;
            border-radius: 30px;
            background: #111; /* Fallback, overridden by config */
            color: #fff;
            border: none;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            z-index: 2;
        }

        #hakken-widget-button:hover {
            transform: scale(1.05);
            box-shadow: 0 12px 32px rgba(0,0,0,0.3);
        }

        .hakken-widget-icon {
            width: 24px;
            height: 24px;
            transition: opacity 0.2s ease, transform 0.2s ease;
            position: absolute;
        }

        .hakken-icon-chat { opacity: 1; transform: scale(1) rotate(0deg); }
        .hakken-icon-close { opacity: 0; transform: scale(0.5) rotate(-90deg); }

        #hakken-widget-button.hakken-open .hakken-icon-chat { opacity: 0; transform: scale(0.5) rotate(90deg); }
        #hakken-widget-button.hakken-open .hakken-icon-close { opacity: 1; transform: scale(1) rotate(0deg); }

        /* Pop-up Preview Bubble */
        #hakken-widget-popup {
            position: absolute;
            bottom: calc(100% + 16px);
            right: 0;
            width: 280px;
            background: #fff;
            color: #111;
            padding: 16px;
            border-radius: 16px;
            border-bottom-right-radius: 4px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            font-size: 14px;
            line-height: 1.5;
            cursor: pointer;
            opacity: 0;
            transform: translateY(10px);
            pointer-events: none;
            transition: opacity 0.4s ease, transform 0.4s ease;
            z-index: 1;
        }

        #hakken-widget-popup::after {
            content: '';
            position: absolute;
            bottom: -6px;
            right: 18px;
            width: 14px;
            height: 14px;
            background: #fff;
            transform: rotate(45deg);
        }
        
        #hakken-widget-popup.hakken-show-popup {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }

        /* Hide popup if widget is open */
        #hakken-widget-button-container.hakken-open #hakken-widget-popup {
            opacity: 0 !important;
            transform: translateY(10px) !important;
            pointer-events: none !important;
        }

        @keyframes hakkenBounceIn {
            0% { opacity: 0; transform: translateY(20px) scale(0.9); }
            60% { opacity: 1; transform: translateY(-5px) scale(1.02); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 480px) {
            #hakken-widget-iframe-wrapper {
                width: calc(100vw - 48px);
                height: calc(100vh - 120px);
            }
        }
    `;
    document.head.appendChild(style);

    // Create Container
    const container = document.createElement('div');
    container.id = 'hakken-widget-container';

    // Create Iframe Wrapper
    const iframeWrapper = document.createElement('div');
    iframeWrapper.id = 'hakken-widget-iframe-wrapper';

    // Build Iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'hakken-widget-iframe';
    iframe.src = `${hostUrl}/w/${widgetId}`;
    iframe.allow = "microphone";
    iframeWrapper.appendChild(iframe);

    // Create Button Container (Holds Button + Popup)
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'hakken-widget-button-container';

    // Create Pop-up Bubble
    const popup = document.createElement('div');
    popup.id = 'hakken-widget-popup';
    popup.addEventListener('click', () => {
        // Clicking popup acts like clicking button to open
        toggleWidget();
    });
    buttonContainer.appendChild(popup);

    // Create Toggle Button
    const button = document.createElement('button');
    button.id = 'hakken-widget-button';
    button.setAttribute('aria-label', 'Toggle Chat');
    button.innerHTML = `
        <svg class="hakken-widget-icon hakken-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <svg class="hakken-widget-icon hakken-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    `;
    button.addEventListener('click', toggleWidget);
    buttonContainer.appendChild(button);

    // Manage State
    let isOpen = false;
    let widgetConfig = null;

    function toggleWidget() {
        isOpen = !isOpen;
        if (isOpen) {
            iframeWrapper.classList.add('hakken-open');
            button.classList.add('hakken-open');
            buttonContainer.classList.add('hakken-open');
            iframe.contentWindow.postMessage({ type: 'WIDGET_OPENED' }, hostUrl);
        } else {
            iframeWrapper.classList.remove('hakken-open');
            button.classList.remove('hakken-open');
            buttonContainer.classList.remove('hakken-open');
        }
    }

    // Listen for events from the Iframe
    window.addEventListener('message', (event) => {
        // Strict security check: ensure origin matches the trusted Hakken deployment
        if (event.origin !== hostUrl) return;
        
        if (event.data && event.data.type === 'HAKKEN_WIDGET_CONFIG') {
            widgetConfig = event.data;
            
            // 1. Apply primary color to button
            if (widgetConfig.primaryColor) {
               button.style.backgroundColor = widgetConfig.primaryColor;
            }

            // 2. Render Popup if valid and widget not currently open
            if (widgetConfig.showPopup && widgetConfig.themeGreeting && !isOpen) {
               popup.innerText = widgetConfig.themeGreeting;
               // Delay animation slightly for dramatic entry
               setTimeout(() => {
                   popup.classList.add('hakken-show-popup');
                   popup.style.animation = "hakkenBounceIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards";
               }, 1000);
            }
        }
    });

    // Assemble DOM
    container.appendChild(iframeWrapper);
    container.appendChild(buttonContainer);
    document.body.appendChild(container);

})();
