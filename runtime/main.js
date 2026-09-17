// ============================================
// التكامل مع نظام التصدير
// ============================================

// تأكد من تحميل مكتبة JSZip
function loadExportDependencies() {
    return new Promise((resolve) => {
        if (typeof JSZip !== 'undefined') {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

// تهيئة نظام التصدير
async function initializeExportSystem() {
    await loadExportDependencies();
    
    // انتظر حتى يكون المحرك جاهزًا
    const checkReady = setInterval(() => {
        if (window.scene && window.camera) {
            clearInterval(checkReady);
            
            // إنشاء نظام التصدير
            window.gameExportSystem = new GameExportSystem({
                scene: window.scene,
                player: window.player,
                camera: window.camera,
                renderer: window.renderer
            });
            
            console.log('✅ Export System Initialized');
            
            // إضافة زر التصدير للواجهة
            addExportButtonToUI();
        }
    }, 100);
}

// إضافة زر التصدير
function addExportButtonToUI() {
    // البحث عن مكان مناسب في الواجهة
    const toolbar = document.querySelector('.toolbar') || 
                   document.querySelector('.menu-bar') ||
                   document.getElementById('main-toolbar');
    
    if (toolbar) {
        const exportBtn = document.createElement('button');
        exportBtn.className = 'tool-button';
        exportBtn.innerHTML = '📦 Export Game';
        exportBtn.onclick = () => {
            if (window.gameExportSystem) {
                window.gameExportSystem.showExportDialog();
            } else {
                alert('Export system not initialized yet. Please wait...');
            }
        };
        
        toolbar.appendChild(exportBtn);
    }
}

// التهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initializeExportSystem);

// ============================================
// تكامل نظام التصدير مع المحرك
// ============================================

// تأكد من تحميل مكتبة JSZip
function loadJSZip() {
    return new Promise((resolve) => {
        if (typeof JSZip !== 'undefined') {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

// تهيئة نظام التصدير
async function initializeExportSystem() {
    await loadJSZip();
    
    // انتظر حتى يكون المحرك جاهزاً
    if (!window.scene || !window.camera) {
        console.warn('Engine not ready, retrying in 1 second...');
        setTimeout(initializeExportSystem, 1000);
        return;
    }
    
    console.log('🎮 Engine ready, initializing export system...');
    
    // هنا يمكنك تحميل نظام التصدير الكامل
    loadExportSystem();
}

// تحميل نظام التصدير الكامل
function loadExportSystem() {
    const script = document.createElement('script');
    script.src = 'runtime/game-export-system.js';
    script.onload = function() {
        if (typeof GameExportSystem !== 'undefined') {
            // إنشاء مثيل نظام التصدير
            window.gameExportSystem = new GameExportSystem({
                scene: window.scene,
                player: window.player,
                camera: window.camera,
                renderer: window.renderer
            });
            
            console.log('✅ Full export system loaded');
            
            // ربط أزرار التصدير بالنظام
            bindExportButtons();
        }
    };
    document.head.appendChild(script);
}

// ربط أزرار الواجهة بالنظام
function bindExportButtons() {
    const startBtn = document.getElementById('start-export-btn');
    if (startBtn && window.gameExportSystem) {
        startBtn.addEventListener('click', function() {
            window.gameExportSystem.startExportProcess();
        });
    }
}

// البدء عند تحميل الصفحة
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExportSystem);
} else {
    initializeExportSystem();
}
// تصدير الدوال للاستخدام
export { initializeExportSystem, addExportButtonToUI };