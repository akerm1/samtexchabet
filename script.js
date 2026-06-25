// ============================================================
// SECTION 1: CONFIGURATION & CONSTANTS
// ============================================================
(function() {
    'use strict';

    const DB_NAME = 'ShopPOSCoreEngine';
    const DB_VERSION = 7;
    const DEFAULT_VAT_RATE = 19;
    const DEFAULT_LOW_STOCK = 5;
    const DEFAULT_CURRENCY = 'DA';
    const SCAN_TIMEOUT = 250;
    const MAX_SCAN_LENGTH = 50;
    const MIN_SCAN_LENGTH = 2;
    const BACKUP_KEY = 'shoppos_autobackup';

    // ============================================================
    // SECTION 2: APPLICATION STATE
    // ============================================================
    let currentView = 'checkout';
    let cart = [];
    let db = null;
    let audioCtx = null;
    let isProcessingScan = false;
    let formInputActive = false;
    let focusLockEnabled = true;
    let editingBarcode = null;
    let customers = [];
    let viewingCustomerId = null;
    let isInitialized = false;
    let scannerReady = true;
    let paymentStatus = 'unpaid'; // 'paid' or 'unpaid'

    let settings = {
        vatRate: DEFAULT_VAT_RATE,
        lowStockThreshold: DEFAULT_LOW_STOCK,
        currency: DEFAULT_CURRENCY
    };

    // Scanner state
    let scanBuffer = '';
    let scanTimer = null;
    let isScanning = false;
    let scanStartTime = 0;
    let consecutiveScans = 0;
    let lastBarcode = '';
    let scanLock = false;
    let lastKeyTime = 0;

    // ============================================================
    // SECTION 3: DOM REFERENCES
    // ============================================================
    const DOM = {
        scannerInput: document.getElementById('scanner-receiver'),
        views: {
            checkout: document.getElementById('view-checkout'),
            inventory: document.getElementById('view-inventory'),
            customers: document.getElementById('view-customers'),
            analytics: document.getElementById('view-analytics'),
            settings: document.getElementById('view-settings')
        },
        navTabs: document.querySelectorAll('.nav-tab'),
        cartBody: document.getElementById('cart-table-body'),
        inventoryBody: document.getElementById('inventory-table-body'),
        analyticsBody: document.getElementById('analytics-table-body'),
        checkoutSubtotal: document.getElementById('checkout-subtotal'),
        checkoutVat: document.getElementById('checkout-vat'),
        checkoutDiscount: document.getElementById('checkout-discount'),
        checkoutGrandtotal: document.getElementById('checkout-grandtotal'),
        cartCount: document.getElementById('cart-count'),
        invProductCount: document.getElementById('inv-product-count'),
        invLowStockCount: document.getElementById('inv-low-stock-count'),
        invTotalValue: document.getElementById('inv-total-value'),
        analyticsRevenue: document.getElementById('analytics-revenue'),
        analyticsTransactions: document.getElementById('analytics-transactions'),
        analyticsItemsSold: document.getElementById('analytics-items-sold'),
        analyticsAverage: document.getElementById('analytics-average'),
        analyticsTotalDebt: document.getElementById('analytics-total-debt'),
        analyticsCustomersWithDebt: document.getElementById('analytics-customers-with-debt'),
        clockDisplay: document.getElementById('clock-display'),
        vatRateDisplay: document.getElementById('vat-rate-display'),
        amountPaidInput: document.getElementById('amount-paid'),
        remainingAmount: document.getElementById('remaining-amount'),
        customerSelect: document.getElementById('customer-select'),
        checkoutCustomerName: document.getElementById('checkout-customer-name'),
        productForm: document.getElementById('product-form'),
        formBarcode: document.getElementById('form-barcode'),
        formName: document.getElementById('form-name'),
        formCategory: document.getElementById('form-category'),
        formUnit: document.getElementById('form-unit'),
        formPrice: document.getElementById('form-price'),
        formStock: document.getElementById('form-stock'),
        formFeedback: document.getElementById('form-feedback'),
        customerForm: document.getElementById('customer-form'),
        customerName: document.getElementById('customer-name'),
        customerPhone: document.getElementById('customer-phone'),
        customerAddress: document.getElementById('customer-address'),
        customerFeedback: document.getElementById('customer-feedback'),
        customersList: document.getElementById('customers-list'),
        customerSearch: document.getElementById('customer-search'),
        settingsVat: document.getElementById('settings-vat'),
        settingsLowStock: document.getElementById('settings-low-stock'),
        settingsCurrency: document.getElementById('settings-currency'),
        settingsFeedback: document.getElementById('settings-feedback'),
        settingsDbInfo: document.getElementById('settings-db-info'),
        settingsStorageInfo: document.getElementById('settings-storage-info'),
        btnComplete: document.getElementById('btn-complete-transaction'),
        btnClearCart: document.getElementById('btn-clear-cart'),
        btnBulkDelete: document.getElementById('btn-bulk-delete'),
        btnBulkDeleteCustomers: document.getElementById('btn-bulk-delete-customers'),
        btnExportCsv: document.getElementById('btn-export-csv'),
        btnExportJson: document.getElementById('btn-export-json'),
        btnImportJson: document.getElementById('btn-import-json'),
        btnClearSales: document.getElementById('btn-clear-sales'),
        btnSaveSettings: document.getElementById('btn-save-settings'),
        btnResetSettings: document.getElementById('btn-reset-settings'),
        btnResetAll: document.getElementById('btn-reset-all'),
        btnExportFullBackup: document.getElementById('btn-export-full-backup'),
        fileImportFull: document.getElementById('file-import-full'),
        btnNewCustomer: document.getElementById('btn-new-customer'),
        editModal: document.getElementById('edit-modal'),
        editForm: document.getElementById('edit-product-form'),
        editBarcode: document.getElementById('edit-barcode'),
        editName: document.getElementById('edit-name'),
        editCategory: document.getElementById('edit-category'),
        editUnit: document.getElementById('edit-unit'),
        editPrice: document.getElementById('edit-price'),
        editStock: document.getElementById('edit-stock'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        customerDetailModal: document.getElementById('customer-detail-modal'),
        customerDetailName: document.getElementById('customer-detail-name'),
        detailPhone: document.getElementById('detail-phone'),
        detailAddress: document.getElementById('detail-address'),
        detailDate: document.getElementById('detail-date'),
        detailTotalDebt: document.getElementById('detail-total-debt'),
        customerDebtsBody: document.getElementById('customer-debts-body'),
        btnPayDebt: document.getElementById('btn-pay-debt'),
        btnCloseCustomerModal: document.getElementById('btn-close-customer-modal'),
        toastContainer: document.getElementById('toast-container'),
        partialPaymentAmount: document.getElementById('partial-payment-amount'),
        partialPaymentRemaining: document.getElementById('partial-payment-remaining'),
        btnPartialPayment: document.getElementById('btn-partial-payment'),
        partialPaymentSection: document.getElementById('partial-payment-section')
    };

    // ============================================================
    // SECTION 4: UTILITY FUNCTIONS
    // ============================================================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(message, type = 'info') {
        const container = DOM.toastContainer;
        if (!container) {
            console.log('Toast:', message, type);
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function resetPaymentButtons() {
        const btnPay = document.getElementById('btn-pay');
        const btnNotPay = document.getElementById('btn-not-pay');
        if (btnPay && btnNotPay) {
            btnPay.style.background = '#e0e0e0';
            btnPay.style.color = '#333';
            btnNotPay.style.background = 'var(--danger)';
            btnNotPay.style.color = 'white';
        }
        paymentStatus = 'unpaid';
    }

    // ============================================================
    // SECTION 4.5: PARTIAL PAYMENT HELPERS
    // ============================================================
    function updatePartialPaymentRemaining() {
        const amountInput = DOM.partialPaymentAmount;
        const remainingDisplay = DOM.partialPaymentRemaining;
        if (!amountInput || !remainingDisplay) return;
        
        const customerId = viewingCustomerId;
        if (!customerId) {
            remainingDisplay.textContent = `0.00 ${settings.currency}`;
            return;
        }
        
        const customer = customers.find(c => c.id === customerId);
        if (!customer) {
            remainingDisplay.textContent = `0.00 ${settings.currency}`;
            return;
        }
        
        const totalDebt = customer.debts ? customer.debts.reduce((sum, d) => sum + d.remainingAmount, 0) : 0;
        const paymentAmount = parseFloat(amountInput.value) || 0;
        const remaining = Math.max(0, totalDebt - paymentAmount);
        
        remainingDisplay.textContent = `${remaining.toFixed(2)} ${settings.currency}`;
        
        if (remaining === 0) {
            remainingDisplay.style.color = 'var(--success)';
        } else {
            remainingDisplay.style.color = 'var(--danger)';
        }
    }

    // ============================================================
    // SECTION 5: AUDIO SYSTEM
    // ============================================================
    function playTone(freq, duration, type = 'sine') {
        try {
            if (!audioCtx) {
                audioCtx = new(window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.value = 0.3;
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (_) { /* silently fail */ }
    }

    function playSuccess() { playTone(880, 0.08, 'sine'); }
    function playError() { playTone(150, 0.25, 'sawtooth'); }
    function playScan() { playTone(440, 0.05, 'square'); }
    function playWarning() { playTone(300, 0.15, 'triangle'); }

    // ============================================================
    // SECTION 6: FOCUS MANAGEMENT
    // ============================================================
    function lockFocus() {
        if (!focusLockEnabled) return;
        if (!DOM.scannerInput) return;
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
            return;
        }
        if (document.activeElement !== DOM.scannerInput) {
            DOM.scannerInput.focus();
        }
    }

    // ============================================================
    // SECTION 7: SCANNER SYSTEM
    // ============================================================
    function resetScanner() {
        if (scanTimer) {
            clearTimeout(scanTimer);
            scanTimer = null;
        }
        isScanning = false;
        scanStartTime = 0;
        scanBuffer = '';
        if (DOM.scannerInput) {
            DOM.scannerInput.value = '';
        }
        const led = document.querySelector('.scanner-led');
        if (led) led.classList.remove('error');
        const text = document.querySelector('.scanner-text');
        if (text) text.textContent = 'Scanner actif';
        scannerReady = true;
    }

    function processCompleteBarcode(barcode) {
        if (scanLock) return;
        if (!scannerReady) return;
        
        const cleaned = barcode.trim();
        if (!cleaned) {
            resetScanner();
            return;
        }
        
        if (cleaned.length < MIN_SCAN_LENGTH) {
            console.log('❌ Barcode too short:', cleaned);
            resetScanner();
            return;
        }
        
        if (cleaned.length > MAX_SCAN_LENGTH) {
            console.log('❌ Barcode too long:', cleaned);
            showToast('⚠️ Code-barres invalide (trop long)', 'warning');
            playWarning();
            resetScanner();
            return;
        }
        
        if (cleaned === lastBarcode && Date.now() - lastKeyTime < 500) {
            console.log('⚠️ Duplicate barcode ignored:', cleaned);
            resetScanner();
            return;
        }
        
        consecutiveScans++;
        if (consecutiveScans > 3 && Date.now() - scanStartTime < 2000) {
            console.log('⚠️ Scanner stuck detected');
            showToast('⚠️ Scanner bloqué - relâchez le bouton', 'warning');
            playWarning();
            resetScanner();
            consecutiveScans = 0;
            return;
        }
        
        setTimeout(() => {
            consecutiveScans = 0;
        }, 3000);
        
        lastBarcode = cleaned;
        lastKeyTime = Date.now();
        
        scannerReady = false;
        scanLock = true;
        
        console.log('✅ Processing barcode:', cleaned);
        
        if (currentView === 'checkout') {
            handleCheckoutScan(cleaned);
        } else if (currentView === 'inventory') {
            handleInventoryScan(cleaned);
        } else {
            showToast('⚠️ Scanner inactif dans cette vue', 'warning');
            playWarning();
        }
        
        setTimeout(() => {
            scannerReady = true;
            scanLock = false;
            resetScanner();
        }, 600);
    }

    function setupScannerListeners() {
        if (!DOM.scannerInput) return;

        DOM.scannerInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
            }
            
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = this.value.trim();
                if (value) {
                    this.value = '';
                    processCompleteBarcode(value);
                } else {
                    resetScanner();
                }
                return;
            }
            
            if (e.key === 'Escape') {
                this.value = '';
                resetScanner();
            }
        });

        DOM.scannerInput.addEventListener('input', function(e) {
            const value = this.value;
            if (!value) {
                resetScanner();
                return;
            }
            
            if (!isScanning) {
                isScanning = true;
                scanStartTime = Date.now();
            }
            
            if (scanTimer) {
                clearTimeout(scanTimer);
                scanTimer = null;
            }
            
            if (value.includes('\n') || value.length > 25) {
                const cleanValue = value.replace(/[\n\r]/g, '').trim();
                if (cleanValue) {
                    this.value = '';
                    processCompleteBarcode(cleanValue);
                }
                return;
            }
            
            scanTimer = setTimeout(() => {
                const val = this.value.trim();
                if (val) {
                    if (val.length >= MIN_SCAN_LENGTH && val.length <= MAX_SCAN_LENGTH) {
                        this.value = '';
                        processCompleteBarcode(val);
                    } else {
                        console.log('⚠️ Partial or invalid barcode:', val);
                        resetScanner();
                    }
                } else {
                    resetScanner();
                }
                scanTimer = null;
            }, SCAN_TIMEOUT);
        });

        DOM.scannerInput.addEventListener('paste', function(e) {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (text) {
                this.value = '';
                processCompleteBarcode(text.trim());
            }
        });
    }

    // ============================================================
    // SECTION 8: INDEXEDDB DATABASE
    // ============================================================
    function dbGetAll(storeName) {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('Database not initialized'));
                return;
            }
            try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.getAll();
                req.onsuccess = () => {
                    const result = req.result || [];
                    console.log(`✅ Retrieved ${result.length} items from ${storeName}`);
                    resolve(result);
                };
                req.onerror = (event) => {
                    console.error(`Error getting all from ${storeName}:`, event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error(`Transaction error for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    function dbGet(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('Database not initialized'));
                return;
            }
            try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.get(key);
                req.onsuccess = () => {
                    resolve(req.result || null);
                };
                req.onerror = (event) => {
                    console.error(`Error getting from ${storeName}:`, event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error(`Transaction error for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    function dbPut(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('Database not initialized'));
                return;
            }
            try {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.put(data);
                req.onsuccess = () => {
                    console.log(`✅ Saved to ${storeName}:`, data);
                    resolve(req.result);
                };
                req.onerror = (event) => {
                    console.error(`Error saving to ${storeName}:`, event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error(`Transaction error for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    function dbDelete(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('Database not initialized'));
                return;
            }
            try {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.delete(key);
                req.onsuccess = () => {
                    console.log(`✅ Deleted from ${storeName}:`, key);
                    resolve();
                };
                req.onerror = (event) => {
                    console.error(`Error deleting from ${storeName}:`, event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error(`Transaction error for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    function dbClear(storeName) {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('Database not initialized'));
                return;
            }
            try {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.clear();
                req.onsuccess = () => {
                    console.log(`✅ Cleared ${storeName}`);
                    resolve();
                };
                req.onerror = (event) => {
                    console.error(`Error clearing ${storeName}:`, event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error(`Transaction error for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    function openDB() {
        return new Promise((resolve, reject) => {
            const checkRequest = indexedDB.open(DB_NAME);
            let existingVersion = 0;
            
            checkRequest.onsuccess = function(ev) {
                const dbCheck = ev.target.result;
                existingVersion = dbCheck.version;
                dbCheck.close();
                
                console.log('📦 Existing database version:', existingVersion);
                
                const openVersion = Math.max(DB_VERSION, existingVersion + 1);
                console.log('📦 Opening with version:', openVersion);
                
                const request = indexedDB.open(DB_NAME, openVersion);
                
                request.onupgradeneeded = (ev) => {
                    const d = ev.target.result;
                    console.log('📦 Upgrading database schema...');
                    
                    if (!d.objectStoreNames.contains('products')) {
                        const productStore = d.createObjectStore('products', { keyPath: 'barcode' });
                        productStore.createIndex('name', 'name', { unique: false });
                        productStore.createIndex('category', 'category', { unique: false });
                        console.log('✅ Products store created');
                    }
                    
                    if (!d.objectStoreNames.contains('sales')) {
                        const salesStore = d.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
                        salesStore.createIndex('timestamp', 'timestamp', { unique: false });
                        salesStore.createIndex('customerId', 'customerId', { unique: false });
                        console.log('✅ Sales store created');
                    }
                    
                    if (!d.objectStoreNames.contains('settings')) {
                        d.createObjectStore('settings', { keyPath: 'key' });
                        console.log('✅ Settings store created');
                    }
                    
                    if (!d.objectStoreNames.contains('customers')) {
                        d.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
                        console.log('✅ Customers store created');
                    }
                };
                
                request.onsuccess = (ev) => { 
                    db = ev.target.result;
                    console.log('✅ Database connected successfully');
                    resolve(db); 
                };
                
                request.onerror = (ev) => { 
                    console.error('Database open error:', ev.target.error);
                    reject(ev.target.error); 
                };
            };
            
            checkRequest.onerror = function(ev) {
                console.log('📦 No existing database, creating new...');
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                
                request.onupgradeneeded = (ev) => {
                    const d = ev.target.result;
                    console.log('📦 Creating database schema...');
                    
                    const productStore = d.createObjectStore('products', { keyPath: 'barcode' });
                    productStore.createIndex('name', 'name', { unique: false });
                    productStore.createIndex('category', 'category', { unique: false });
                    
                    const salesStore = d.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
                    salesStore.createIndex('timestamp', 'timestamp', { unique: false });
                    salesStore.createIndex('customerId', 'customerId', { unique: false });
                    
                    d.createObjectStore('settings', { keyPath: 'key' });
                    d.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
                    
                    console.log('✅ Database schema created');
                };
                
                request.onsuccess = (ev) => { 
                    db = ev.target.result;
                    console.log('✅ Database connected successfully');
                    resolve(db); 
                };
                
                request.onerror = (ev) => { 
                    console.error('Database open error:', ev.target.error);
                    reject(ev.target.error); 
                };
            };
        });
    }

    // ============================================================
    // SECTION 9: SETTINGS MANAGEMENT
    // ============================================================
    async function loadSettings() {
        try {
            const vatSetting = await dbGet('settings', 'vatRate');
            const lowStockSetting = await dbGet('settings', 'lowStockThreshold');
            const currencySetting = await dbGet('settings', 'currency');
            
            settings.vatRate = vatSetting ? vatSetting.value : DEFAULT_VAT_RATE;
            settings.lowStockThreshold = lowStockSetting ? lowStockSetting.value : DEFAULT_LOW_STOCK;
            settings.currency = currencySetting ? currencySetting.value : DEFAULT_CURRENCY;
            
            if (DOM.settingsVat) DOM.settingsVat.value = settings.vatRate;
            if (DOM.settingsLowStock) DOM.settingsLowStock.value = settings.lowStockThreshold;
            if (DOM.settingsCurrency) DOM.settingsCurrency.value = settings.currency;
            if (DOM.vatRateDisplay) DOM.vatRateDisplay.textContent = settings.vatRate;
            
            updateSettingsInfo();
        } catch (error) {
            console.error('Load settings error:', error);
        }
    }

    async function saveSettings() {
        try {
            const vat = parseFloat(DOM.settingsVat.value);
            const lowStock = parseInt(DOM.settingsLowStock.value);
            const currency = DOM.settingsCurrency.value.trim();
            
            if (isNaN(vat) || vat < 0) {
                DOM.settingsFeedback.textContent = '⚠️ Taux de TVA invalide';
                DOM.settingsFeedback.style.color = 'var(--danger)';
                return;
            }
            
            if (isNaN(lowStock) || lowStock < 0) {
                DOM.settingsFeedback.textContent = '⚠️ Seuil de stock invalide';
                DOM.settingsFeedback.style.color = 'var(--danger)';
                return;
            }
            
            if (!currency) {
                DOM.settingsFeedback.textContent = '⚠️ Symbole de devise requis';
                DOM.settingsFeedback.style.color = 'var(--danger)';
                return;
            }
            
            await dbPut('settings', { key: 'vatRate', value: vat });
            await dbPut('settings', { key: 'lowStockThreshold', value: lowStock });
            await dbPut('settings', { key: 'currency', value: currency });
            
            settings.vatRate = vat;
            settings.lowStockThreshold = lowStock;
            settings.currency = currency;
            
            if (DOM.vatRateDisplay) DOM.vatRateDisplay.textContent = vat;
            DOM.settingsFeedback.textContent = '✅ Paramètres sauvegardés !';
            DOM.settingsFeedback.style.color = 'var(--success)';
            showToast('✅ Paramètres sauvegardés', 'success');
            
            renderCart();
            loadInventory();
            
        } catch (error) {
            console.error('Save settings error:', error);
            DOM.settingsFeedback.textContent = '❌ Échec de la sauvegarde';
            DOM.settingsFeedback.style.color = 'var(--danger)';
            showToast('❌ Échec de la sauvegarde', 'error');
        }
    }

    async function updateSettingsInfo() {
        try {
            const products = await dbGetAll('products');
            const sales = await dbGetAll('sales');
            const customersData = await dbGetAll('customers');
            
            if (DOM.settingsDbInfo) {
                DOM.settingsDbInfo.textContent = `Base de données: ${DB_NAME} | Produits: ${products.length} | Ventes: ${sales.length} | Clients: ${customersData.length}`;
            }
            
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate();
                const used = (estimate.usage / (1024 * 1024)).toFixed(1);
                const total = (estimate.quota / (1024 * 1024)).toFixed(1);
                if (DOM.settingsStorageInfo) {
                    DOM.settingsStorageInfo.textContent = `Stockage: ${used} MB / ${total} MB utilisé`;
                }
            } else {
                if (DOM.settingsStorageInfo) {
                    DOM.settingsStorageInfo.textContent = 'Stockage: Non disponible';
                }
            }
        } catch (error) {
            console.error('Update settings info error:', error);
        }
    }

    // ============================================================
    // SECTION 10: AUTO-BACKUP SYSTEM
    // ============================================================
    async function createAutoBackup() {
        try {
            const products = await dbGetAll('products');
            const sales = await dbGetAll('sales');
            const customersData = await dbGetAll('customers');
            const settingsData = await dbGetAll('settings');
            
            const backup = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                products: products,
                sales: sales,
                customers: customersData,
                settings: settingsData
            };
            
            localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
            console.log('✅ Auto-backup created');
        } catch (error) {
            console.error('Auto-backup error:', error);
        }
    }

    // ============================================================
    // SECTION 11: VIEW ROUTER
    // ============================================================
    function switchView(viewId) {
        if (!DOM.views) return;
        Object.values(DOM.views).forEach(v => {
            if (v) v.classList.remove('active');
        });
        if (DOM.views[viewId]) DOM.views[viewId].classList.add('active');
        currentView = viewId;
        if (DOM.navTabs) {
            DOM.navTabs.forEach(tab => {
                tab.classList.toggle('active', tab.dataset.view === viewId);
            });
        }
        if (viewId === 'checkout') renderCart();
        if (viewId === 'inventory') loadInventory();
        if (viewId === 'customers') loadCustomers();
        if (viewId === 'analytics') loadAnalytics();
        if (viewId === 'settings') updateSettingsInfo();
        
        resetScanner();
        
        setTimeout(() => {
            if (!formInputActive) {
                lockFocus();
            }
        }, 100);
    }

      // ============================================================
    // SECTION 12: CART OPERATIONS (with Reduced Price)
    // ============================================================
    function addToCart(product) {
        const existing = cart.find(item => item.barcode === product.barcode);
        if (existing) {
            existing.qty += 1;
        } else {
            cart.push({
                barcode: product.barcode,
                name: product.name,
                price: product.price,
                reducedPrice: null, // null means no reduction
                unit: product.unit || 'pièce',
                qty: 1
            });
        }
        renderCart();
        playScan();
    }

    function updateCartQty(index, delta) {
        if (index < 0 || index >= cart.length) return;
        const newQty = cart[index].qty + delta;
        if (newQty <= 0) {
            cart.splice(index, 1);
        } else {
            cart[index].qty = newQty;
        }
        renderCart();
    }

    function removeFromCart(index) {
        if (index < 0 || index >= cart.length) return;
        cart.splice(index, 1);
        renderCart();
    }

    function updateReducedPrice(index, newPrice) {
        if (index < 0 || index >= cart.length) return;
        const price = parseFloat(newPrice);
        if (isNaN(price) || price < 0) {
            cart[index].reducedPrice = null;
        } else {
            cart[index].reducedPrice = price;
        }
        renderCart();
    }

    function clearCart() {
        if (cart.length === 0) return;
        if (confirm('Vider le panier ?')) {
            cart = [];
            renderCart();
            showToast('Panier vidé', 'info');
        }
    }

    function calculateTotals() {
        let subtotal = 0;
        cart.forEach(item => {
            const effectivePrice = item.reducedPrice !== null && item.reducedPrice < item.price 
                ? item.reducedPrice 
                : item.price;
            subtotal += effectivePrice * item.qty;
        });
        const vat = subtotal * (settings.vatRate / 100);
        const discount = 0;
        const grandTotal = subtotal + vat - discount;
        return { subtotal, vat, discount, grandTotal };
    }

    function renderCart() {
        if (!DOM.cartBody) return;
        if (cart.length === 0) {
            DOM.cartBody.innerHTML = '<tr><td colspan="8" class="empty-cart-msg">Aucun article dans le panier — Scannez un code-barres pour commencer</td></tr>';
            if (DOM.checkoutSubtotal) DOM.checkoutSubtotal.textContent = `0.00 ${settings.currency}`;
            if (DOM.checkoutVat) DOM.checkoutVat.textContent = `0.00 ${settings.currency}`;
            if (DOM.checkoutDiscount) DOM.checkoutDiscount.textContent = `0.00 ${settings.currency}`;
            if (DOM.checkoutGrandtotal) DOM.checkoutGrandtotal.textContent = `0.00 ${settings.currency}`;
            if (DOM.cartCount) DOM.cartCount.textContent = '0';
            updateRemainingAmount();
            return;
        }

        let html = '';
        cart.forEach((item, index) => {
            const effectivePrice = item.reducedPrice !== null && item.reducedPrice < item.price 
                ? item.reducedPrice 
                : item.price;
            const subtotal = effectivePrice * item.qty;
            const hasDiscount = item.reducedPrice !== null && item.reducedPrice < item.price;
            
            html += `
                <tr>
                    <td><strong>${escapeHtml(item.name)}</strong></td>
                    <td>${escapeHtml(item.barcode)}</td>
                    <td>${item.unit || 'pièce'}</td>
                    <td>
                        ${hasDiscount ? `
                            <span class="original-price">${item.price.toFixed(2)}</span>
                            <span class="price-with-discount">${effectivePrice.toFixed(2)}</span>
                        ` : `${item.price.toFixed(2)}`}
                    </td>
                    <td>
                        <input type="number" 
                               class="reduced-price-input ${hasDiscount ? 'has-discount' : ''}" 
                               data-index="${index}"
                               value="${item.reducedPrice !== null ? item.reducedPrice : ''}"
                               placeholder="Prix"
                               step="0.01"
                               min="0">
                    </td>
                    <td>
                        <div class="qty-controls">
                            <button class="btn-qty" data-index="${index}" data-delta="-1">−</button>
                            <span>${item.qty}</span>
                            <button class="btn-qty" data-index="${index}" data-delta="1">+</button>
                        </div>
                    </td>
                    <td>${subtotal.toFixed(2)}</td>
                    <td>
                        <button class="btn-delete-row" data-index="${index}">✕</button>
                    </td>
                </tr>
            `;
        });

        DOM.cartBody.innerHTML = html;
        
        // Quantity buttons
        document.querySelectorAll('.btn-qty').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                const delta = parseInt(this.dataset.delta);
                updateCartQty(index, delta);
            });
        });

        // Delete buttons
        document.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                removeFromCart(index);
            });
        });

        // Reduced price inputs
        document.querySelectorAll('.reduced-price-input').forEach(input => {
            input.addEventListener('change', function() {
                const index = parseInt(this.dataset.index);
                const value = parseFloat(this.value);
                if (isNaN(value) || value < 0) {
                    this.value = '';
                    updateReducedPrice(index, null);
                } else {
                    updateReducedPrice(index, value);
                }
            });
            
            input.addEventListener('input', function() {
                const index = parseInt(this.dataset.index);
                const value = parseFloat(this.value);
                if (!isNaN(value) && value >= 0) {
                    const item = cart[index];
                    if (item && value < item.price) {
                        this.classList.add('has-discount');
                    } else {
                        this.classList.remove('has-discount');
                    }
                } else {
                    this.classList.remove('has-discount');
                }
            });
        });

        const totals = calculateTotals();
        if (DOM.checkoutSubtotal) DOM.checkoutSubtotal.textContent = `${totals.subtotal.toFixed(2)} ${settings.currency}`;
        if (DOM.checkoutVat) DOM.checkoutVat.textContent = `${totals.vat.toFixed(2)} ${settings.currency}`;
        if (DOM.checkoutDiscount) DOM.checkoutDiscount.textContent = `${totals.discount.toFixed(2)} ${settings.currency}`;
        if (DOM.checkoutGrandtotal) DOM.checkoutGrandtotal.textContent = `${totals.grandTotal.toFixed(2)} ${settings.currency}`;
        if (DOM.cartCount) DOM.cartCount.textContent = cart.length;
        updateRemainingAmount();
    }

    // ============================================================
    // SECTION 13: PAYMENT SYSTEM
    // ============================================================
    function updateRemainingAmount() {
        if (!DOM.checkoutGrandtotal || !DOM.amountPaidInput || !DOM.remainingAmount) return;
        const totalText = DOM.checkoutGrandtotal.textContent || '0';
        const total = parseFloat(totalText) || 0;
        const paid = parseFloat(DOM.amountPaidInput.value) || 0;
        const remaining = Math.max(0, total - paid);
        DOM.remainingAmount.textContent = `${remaining.toFixed(2)} ${settings.currency}`;
        
        if (remaining === 0) {
            DOM.remainingAmount.style.color = 'var(--success)';
        } else if (remaining > 0) {
            DOM.remainingAmount.style.color = 'var(--danger)';
        }
    }

    // ============================================================
    // SECTION 14: SCAN HANDLERS
    // ============================================================
    async function handleCheckoutScan(barcode) {
        try {
            const product = await dbGet('products', barcode);
            if (product) {
                if (product.stock <= 0) {
                    playError();
                    showToast(`❌ ${product.name} est en rupture de stock !`, 'error');
                    return;
                }
                addToCart(product);
                showToast(`✅ ${product.name} ajouté au panier`, 'success');
            } else {
                playError();
                showToast(`❌ Produit avec le code "${barcode}" introuvable`, 'error');
            }
        } catch (error) {
            console.error('Checkout scan error:', error);
            playError();
            showToast('❌ Erreur lors du scan', 'error');
        }
    }

    function handleInventoryScan(barcode) {
        focusLockEnabled = false;
        if (DOM.formBarcode) DOM.formBarcode.value = barcode;
        showToast(`📦 Code-barres ${barcode} chargé`, 'info');
        playScan();
        
        setTimeout(() => {
            if (DOM.formName) {
                DOM.formName.focus();
                DOM.formName.select();
            }
            setTimeout(() => {
                focusLockEnabled = true;
            }, 1000);
        }, 150);
    }

    // ============================================================
    // SECTION 15: TRANSACTION COMPLETION
    // ============================================================
    async function completeTransaction() {
        if (cart.length === 0) {
            showToast('❌ Panier vide !', 'error');
            playError();
            return;
        }

        for (const item of cart) {
            const product = await dbGet('products', item.barcode);
            if (!product) {
                showToast(`❌ Produit "${item.name}" introuvable`, 'error');
                playError();
                return;
            }
            if (product.stock < item.qty) {
                showToast(`❌ Stock insuffisant pour "${item.name}" (disponible: ${product.stock})`, 'error');
                playError();
                return;
            }
        }

        const totals = calculateTotals();
        const totalAmount = totals.grandTotal;
        const paidAmount = parseFloat(DOM.amountPaidInput ? DOM.amountPaidInput.value : 0) || 0;
        
        const isPaymentMarkedPaid = paymentStatus === 'paid';
        
        let remainingAmountValue;
        let isDebt;
        let finalPaymentStatus;
        
        if (isPaymentMarkedPaid) {
            remainingAmountValue = 0;
            isDebt = false;
            finalPaymentStatus = 'paid';
        } else {
            remainingAmountValue = Math.max(0, totalAmount - paidAmount);
            isDebt = remainingAmountValue > 0;
            finalPaymentStatus = isDebt ? (paidAmount > 0 ? 'partial' : 'credit') : 'paid';
        }
        
        const customerId = DOM.customerSelect && DOM.customerSelect.value ? parseInt(DOM.customerSelect.value) : null;

        try {
            const tx = db.transaction(['products', 'sales'], 'readwrite');
            const productStore = tx.objectStore('products');
            const salesStore = tx.objectStore('sales');

            for (const item of cart) {
                const product = await new Promise((resolve, reject) => {
                    const req = productStore.get(item.barcode);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });

                if (product) {
                    product.stock -= item.qty;
                    await new Promise((resolve, reject) => {
                        const req = productStore.put(product);
                        req.onsuccess = () => resolve();
                        req.onerror = () => reject(req.error);
                    });
                }
            }

            const salesRecord = {
                timestamp: new Date().toISOString(),
                customerId: customerId,
                customerName: customerId ? customers.find(c => c.id === customerId)?.name || null : null,
                items: cart.map(item => ({
                    name: item.name,
                    barcode: item.barcode,
                    qty: item.qty,
                    unit: item.unit || 'pièce',
                    soldPrice: item.price
                })),
                subtotal: totals.subtotal,
                vat: totals.vat,
                discount: totals.discount,
                grandTotal: totals.grandTotal,
                amountPaid: isPaymentMarkedPaid ? totals.grandTotal : paidAmount,
                remainingAmount: remainingAmountValue,
                paymentStatus: finalPaymentStatus,
                isDebt: isDebt,
                paymentMarked: isPaymentMarkedPaid ? 'paid' : 'unpaid'
            };

            const saleId = await new Promise((resolve, reject) => {
                const req = salesStore.add(salesRecord);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            if (customerId && isDebt) {
                const customer = await dbGet('customers', customerId);
                if (customer) {
                    if (!customer.debts) customer.debts = [];
                    customer.debts.push({
                        saleId: saleId,
                        date: new Date().toISOString(),
                        items: cart.map(item => ({
                            name: item.name,
                            qty: item.qty,
                            unit: item.unit || 'pièce',
                            price: item.price
                        })),
                        totalAmount: totals.grandTotal,
                        paidAmount: paidAmount,
                        remainingAmount: remainingAmountValue,
                        status: remainingAmountValue > 0 ? 'pending' : 'paid'
                    });
                    await dbPut('customers', customer);
                }
            }

            cart = [];
            renderCart();
            if (DOM.amountPaidInput) DOM.amountPaidInput.value = '0';
            
            resetPaymentButtons();
            
            playSuccess();
            
            if (isPaymentMarkedPaid) {
                showToast(`✅ Transaction complète ! Total: ${totals.grandTotal.toFixed(2)} ${settings.currency}`, 'success');
            } else if (isDebt) {
                showToast(`✅ Vente enregistrée - Dette: ${remainingAmountValue.toFixed(2)} ${settings.currency}`, 'warning');
            } else {
                showToast(`✅ Transaction complète ! Total: ${totals.grandTotal.toFixed(2)} ${settings.currency}`, 'success');
            }

            await createAutoBackup();
            
            if (currentView === 'analytics') {
                loadAnalytics();
            }
            if (currentView === 'customers') {
                loadCustomers();
            }
            
            resetScanner();

        } catch (error) {
            console.error('Transaction error:', error);
            playError();
            showToast('❌ Échec de la transaction: ' + error.message, 'error');
        }
    }

    // ============================================================
    // SECTION 16: INVENTORY MANAGEMENT
    // ============================================================
    async function loadInventory() {
        try {
            const products = await dbGetAll('products');
            console.log('🔄 Loading inventory:', products.length, 'products found');
            
            if (!DOM.inventoryBody) {
                console.error('Inventory body not found');
                return;
            }
            
            if (!products || products.length === 0) {
                DOM.inventoryBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#999; padding:40px 0;">Aucun produit dans le catalogue</td></tr>';
                if (DOM.invProductCount) DOM.invProductCount.textContent = '0 produits';
                if (DOM.invLowStockCount) DOM.invLowStockCount.textContent = '0 stock bas';
                if (DOM.invTotalValue) DOM.invTotalValue.textContent = `0.00 ${settings.currency} valeur totale`;
                return;
            }

            let html = '';
            let lowStockCount = 0;
            let totalValue = 0;
            
            products.forEach(product => {
                const isLow = product.stock <= settings.lowStockThreshold;
                const isCritical = product.stock === 0;
                if (isLow) lowStockCount++;
                totalValue += product.price * product.stock;
                
                let stockClass = '';
                let stockDisplay = product.stock;
                if (isCritical) {
                    stockClass = 'stock-critical';
                    stockDisplay = '⚠️ ' + product.stock;
                } else if (isLow) {
                    stockClass = 'stock-low';
                }
                
                html += `
                    <tr>
                        <td>${escapeHtml(product.barcode)}</td>
                        <td><strong>${escapeHtml(product.name)}</strong></td>
                        <td>${escapeHtml(product.category || '-')}</td>
                        <td>${product.unit || 'pièce'}</td>
                        <td>${product.price.toFixed(2)}</td>
                        <td class="${stockClass}">${stockDisplay}</td>
                        <td>
                            <button class="btn-edit-product" data-barcode="${escapeHtml(product.barcode)}">✏️</button>
                            <button class="btn-delete-product" data-barcode="${escapeHtml(product.barcode)}">✕</button>
                        </td>
                    </tr>
                `;
            });

            DOM.inventoryBody.innerHTML = html;
            console.log('✅ Inventory table rendered with', products.length, 'products');

            document.querySelectorAll('.btn-edit-product').forEach(btn => {
                btn.addEventListener('click', function() {
                    const barcode = this.dataset.barcode;
                    openEditModal(barcode);
                });
            });

            document.querySelectorAll('.btn-delete-product').forEach(btn => {
                btn.addEventListener('click', async function() {
                    const barcode = this.dataset.barcode;
                    if (confirm(`Supprimer le produit "${barcode}" ?`)) {
                        try {
                            await dbDelete('products', barcode);
                            showToast(`✅ Produit supprimé`, 'success');
                            await loadInventory();
                            await createAutoBackup();
                        } catch (error) {
                            console.error('Delete product error:', error);
                            showToast('❌ Échec de la suppression', 'error');
                        }
                    }
                });
            });

            if (DOM.invProductCount) DOM.invProductCount.textContent = `${products.length} produits`;
            if (DOM.invLowStockCount) DOM.invLowStockCount.textContent = `${lowStockCount} stock bas`;
            if (DOM.invTotalValue) DOM.invTotalValue.textContent = `${totalValue.toFixed(2)} ${settings.currency} valeur totale`;
            
        } catch (error) {
            console.error('Load inventory error:', error);
            showToast('❌ Échec du chargement du stock: ' + error.message, 'error');
        }
    }

    // ============================================================
    // SECTION 17: PRODUCT FORM
    // ============================================================
    function setupProductForm() {
        if (!DOM.productForm) return;

        DOM.productForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const barcode = DOM.formBarcode ? DOM.formBarcode.value.trim() : '';
            const name = DOM.formName ? DOM.formName.value.trim() : '';
            const category = DOM.formCategory ? DOM.formCategory.value.trim() : '';
            const unit = DOM.formUnit ? DOM.formUnit.value : 'pièce';
            const price = DOM.formPrice ? parseFloat(DOM.formPrice.value) : 0;
            const stock = DOM.formStock ? parseInt(DOM.formStock.value) : 0;

            if (!barcode || !name || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) {
                if (DOM.formFeedback) {
                    DOM.formFeedback.textContent = '⚠️ Veuillez remplir tous les champs correctement';
                    DOM.formFeedback.style.color = 'var(--danger)';
                }
                playError();
                return;
            }

            try {
                const existing = await dbGet('products', barcode);
                
                if (existing) {
                    existing.name = name;
                    existing.category = category || '';
                    existing.unit = unit;
                    existing.price = price;
                    existing.stock = stock;
                    await dbPut('products', existing);
                    if (DOM.formFeedback) {
                        DOM.formFeedback.textContent = `✅ Produit "${name}" mis à jour !`;
                        DOM.formFeedback.style.color = 'var(--success)';
                    }
                    showToast(`✅ "${name}" mis à jour`, 'success');
                } else {
                    const newProduct = { 
                        barcode, 
                        name, 
                        category: category || '', 
                        unit: unit,
                        price, 
                        stock 
                    };
                    await dbPut('products', newProduct);
                    if (DOM.formFeedback) {
                        DOM.formFeedback.textContent = `✅ Produit "${name}" ajouté !`;
                        DOM.formFeedback.style.color = 'var(--success)';
                    }
                    showToast(`✅ "${name}" ajouté au catalogue`, 'success');
                }

                playSuccess();
                if (DOM.productForm) DOM.productForm.reset();
                await loadInventory();
                await createAutoBackup();
                
                setTimeout(() => {
                    if (DOM.formBarcode) {
                        DOM.formBarcode.focus();
                    }
                    focusLockEnabled = true;
                    formInputActive = false;
                }, 300);

            } catch (error) {
                console.error('Save product error:', error);
                if (DOM.formFeedback) {
                    DOM.formFeedback.textContent = '❌ Échec de l\'enregistrement: ' + error.message;
                    DOM.formFeedback.style.color = 'var(--danger)';
                }
                playError();
                showToast('❌ Échec de l\'enregistrement', 'error');
            }
        });
    }

    // ============================================================
    // SECTION 18: PRODUCT EDIT MODAL
    // ============================================================
    async function openEditModal(barcode) {
        try {
            const product = await dbGet('products', barcode);
            if (!product) {
                showToast('❌ Produit introuvable', 'error');
                return;
            }
            
            editingBarcode = barcode;
            if (DOM.editBarcode) DOM.editBarcode.value = product.barcode;
            if (DOM.editName) DOM.editName.value = product.name;
            if (DOM.editCategory) DOM.editCategory.value = product.category || '';
            if (DOM.editUnit) DOM.editUnit.value = product.unit || 'pièce';
            if (DOM.editPrice) DOM.editPrice.value = product.price;
            if (DOM.editStock) DOM.editStock.value = product.stock;
            
            if (DOM.editModal) DOM.editModal.classList.add('active');
            setTimeout(() => { if (DOM.editName) DOM.editName.focus(); }, 100);
        } catch (error) {
            console.error('Open edit modal error:', error);
            showToast('❌ Échec du chargement du produit', 'error');
        }
    }

    function closeEditModal() {
        if (DOM.editModal) DOM.editModal.classList.remove('active');
        editingBarcode = null;
    }

    function setupEditForm() {
        if (!DOM.editForm) return;

        DOM.editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const barcode = DOM.editBarcode ? DOM.editBarcode.value.trim() : '';
            const name = DOM.editName ? DOM.editName.value.trim() : '';
            const category = DOM.editCategory ? DOM.editCategory.value.trim() : '';
            const unit = DOM.editUnit ? DOM.editUnit.value : 'pièce';
            const price = DOM.editPrice ? parseFloat(DOM.editPrice.value) : 0;
            const stock = DOM.editStock ? parseInt(DOM.editStock.value) : 0;
            
            if (!barcode || !name || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) {
                showToast('❌ Veuillez remplir tous les champs correctement', 'error');
                return;
            }
            
            try {
                if (barcode !== editingBarcode) {
                    const existing = await dbGet('products', barcode);
                    if (existing) {
                        showToast('❌ Ce code-barres existe déjà', 'error');
                        return;
                    }
                    await dbDelete('products', editingBarcode);
                }
                
                const product = {
                    barcode: barcode,
                    name: name,
                    category: category || '',
                    unit: unit,
                    price: price,
                    stock: stock
                };
                
                await dbPut('products', product);
                showToast(`✅ Produit "${name}" mis à jour !`, 'success');
                playSuccess();
                closeEditModal();
                await loadInventory();
                await createAutoBackup();
                
            } catch (error) {
                console.error('Update product error:', error);
                showToast('❌ Échec de la mise à jour', 'error');
            }
        });

        if (DOM.btnCloseModal) {
            DOM.btnCloseModal.addEventListener('click', closeEditModal);
        }
        
        if (DOM.editModal) {
            DOM.editModal.addEventListener('click', function(e) {
                if (e.target === this) closeEditModal();
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && DOM.editModal && DOM.editModal.classList.contains('active')) {
                closeEditModal();
            }
        });
    }

    // ============================================================
    // SECTION 19: CUSTOMER MANAGEMENT
    // ============================================================
    async function loadCustomers() {
        try {
            customers = await dbGetAll('customers');
            console.log('✅ Customers loaded:', customers.length);
            renderCustomersList();
            populateCustomerSelect();
        } catch (error) {
            console.error('Load customers error:', error);
            showToast('❌ Échec du chargement des clients', 'error');
        }
    }

    function renderCustomersList() {
        if (!DOM.customersList) return;
        const searchTerm = DOM.customerSearch ? DOM.customerSearch.value.toLowerCase() : '';
        const filtered = customers.filter(c => 
            c.name.toLowerCase().includes(searchTerm) ||
            (c.phone && c.phone.includes(searchTerm))
        );

        if (filtered.length === 0) {
            DOM.customersList.innerHTML = `
                <div style="text-align:center; color:#999; padding:40px 0; font-size:16px;">
                    <div style="font-size:48px; margin-bottom:16px;">👤</div>
                    Aucun client trouvé
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach(customer => {
            const totalDebt = customer.debts ? customer.debts.reduce((sum, d) => sum + d.remainingAmount, 0) : 0;
            const hasDebt = totalDebt > 0;
            
            html += `
                <div class="customer-item" data-id="${customer.id}" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 14px 16px;
                    border-bottom: 1px solid #f0f0f0;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-radius: 8px;
                    margin-bottom: 4px;
                    background: ${hasDebt ? '#fff5f5' : 'white'};
                " onmouseover="this.style.background='#f8f9ff'" onmouseout="this.style.background='${hasDebt ? '#fff5f5' : 'white'}'">
                    <div class="info" style="flex: 1;">
                        <div class="name" style="font-weight: 600; font-size: 15px; color: var(--primary);">
                            ${escapeHtml(customer.name)}
                            ${hasDebt ? '<span style="color: var(--danger); font-size: 12px; margin-left: 8px;">🔴 Dette</span>' : ''}
                        </div>
                        <div class="phone" style="font-size: 13px; color: #666; margin-top: 2px;">
                            ${customer.phone || '📱 Pas de téléphone'}
                            ${customer.address ? ` • 📍 ${escapeHtml(customer.address)}` : ''}
                        </div>
                    </div>
                    ${hasDebt ? `
                        <div class="debt" style="
                            background: #ffebee;
                            padding: 4px 14px;
                            border-radius: 20px;
                            font-weight: 700;
                            color: var(--danger);
                            font-size: 14px;
                            margin-right: 12px;
                        ">
                            ${totalDebt.toFixed(2)} ${settings.currency}
                        </div>
                    ` : ''}
                    <div class="actions" style="display: flex; gap: 8px;">
                        <button class="view-btn" onclick="window._customer.view(${customer.id})" style="
                            background: none;
                            border: none;
                            cursor: pointer;
                            padding: 6px 10px;
                            border-radius: 6px;
                            font-size: 16px;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#e8eaf6'" onmouseout="this.style.background='none'">
                            👁️
                        </button>
                        <button class="delete-btn" onclick="window._customer.delete(${customer.id})" style="
                            background: none;
                            border: none;
                            cursor: pointer;
                            padding: 6px 10px;
                            border-radius: 6px;
                            font-size: 16px;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#ffebee'" onmouseout="this.style.background='none'">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        });

        DOM.customersList.innerHTML = html;
    }

    function populateCustomerSelect() {
        if (!DOM.customerSelect) return;
        const currentValue = DOM.customerSelect.value;
        DOM.customerSelect.innerHTML = '<option value="">🔄 Client régulier (sans profil)</option>';
        
        const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
        
        sorted.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            const totalDebt = c.debts ? c.debts.reduce((sum, d) => sum + d.remainingAmount, 0) : 0;
            const debtInfo = totalDebt > 0 ? ` 🔴 (${totalDebt.toFixed(2)} ${settings.currency})` : '';
            option.textContent = `${c.name} ${c.phone ? '📱 ' + c.phone : ''}${debtInfo}`;
            DOM.customerSelect.appendChild(option);
        });
        
        if (currentValue) DOM.customerSelect.value = currentValue;
    }

    // ============================================================
    // SECTION 20: CUSTOMER FORM
    // ============================================================
    function setupCustomerForm() {
        if (!DOM.customerForm) return;

        DOM.customerForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const name = DOM.customerName.value.trim();
            const phone = DOM.customerPhone.value.trim();
            const address = DOM.customerAddress.value.trim();

            if (!name) {
                DOM.customerFeedback.textContent = '⚠️ Le nom est requis';
                DOM.customerFeedback.style.color = 'var(--danger)';
                return;
            }

            try {
                const newCustomer = {
                    name: name,
                    phone: phone || '',
                    address: address || '',
                    createdAt: new Date().toISOString(),
                    debts: []
                };

                const id = await dbPut('customers', newCustomer);
                console.log('✅ Customer saved with ID:', id);
                
                DOM.customerFeedback.textContent = `✅ Client "${name}" enregistré !`;
                DOM.customerFeedback.style.color = 'var(--success)';
                showToast(`✅ Client "${name}" enregistré`, 'success');
                playSuccess();

                DOM.customerForm.reset();
                await loadCustomers();
                await createAutoBackup();

            } catch (error) {
                console.error('Save customer error:', error);
                DOM.customerFeedback.textContent = '❌ Échec de l\'enregistrement: ' + error.message;
                DOM.customerFeedback.style.color = 'var(--danger)';
                showToast('❌ Échec de l\'enregistrement', 'error');
            }
        });
    }

    // ============================================================
    // SECTION 21: CUSTOMER DETAIL MODAL (with Partial Payment)
    // ============================================================
    window._customer = {
        view: async function(id) {
            try {
                const customer = customers.find(c => c.id === id);
                if (!customer) {
                    showToast('❌ Client non trouvé', 'error');
                    return;
                }
                
                viewingCustomerId = id;
                if (DOM.customerDetailName) {
                    DOM.customerDetailName.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 32px;">👤</span>
                            <div>
                                <div style="font-size: 22px; font-weight: 700;">${escapeHtml(customer.name)}</div>
                                <div style="font-size: 14px; color: #666; font-weight: 400;">
                                    ${customer.phone || '📱 Pas de téléphone'}
                                </div>
                            </div>
                        </div>
                    `;
                }
                
                if (DOM.detailPhone) DOM.detailPhone.textContent = customer.phone || '-';
                if (DOM.detailAddress) DOM.detailAddress.textContent = customer.address || '-';
                if (DOM.detailDate) DOM.detailDate.textContent = customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('fr-FR') : '-';

                // Calculate total debt
                const totalDebt = customer.debts ? customer.debts.reduce((sum, d) => sum + d.remainingAmount, 0) : 0;
                
                // Update total debt display
                if (DOM.detailTotalDebt) {
                    DOM.detailTotalDebt.textContent = `${totalDebt.toFixed(2)} ${settings.currency}`;
                    DOM.detailTotalDebt.style.color = totalDebt > 0 ? 'var(--danger)' : 'var(--success)';
                }

                // Show/hide partial payment section
                const partialSection = DOM.partialPaymentSection;
                if (partialSection) {
                    if (totalDebt > 0) {
                        partialSection.style.display = 'block';
                        const amountInput = DOM.partialPaymentAmount;
                        if (amountInput) {
                            amountInput.value = '';
                            amountInput.max = totalDebt;
                            amountInput.placeholder = `Max: ${totalDebt.toFixed(2)}`;
                        }
                        updatePartialPaymentRemaining();
                    } else {
                        partialSection.style.display = 'none';
                    }
                }

                // Render debts table
                if (!customer.debts || customer.debts.length === 0) {
                    if (DOM.customerDebtsBody) {
                        DOM.customerDebtsBody.innerHTML = `
                            <tr>
                                <td colspan="7" style="text-align:center; color:#999; padding:30px 0;">
                                    <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
                                    Aucune dette - Tout est payé !
                                </td>
                            </tr>
                        `;
                    }
                    if (DOM.btnPayDebt) DOM.btnPayDebt.style.display = 'none';
                } else {
                    let html = '';
                    let hasUnpaid = false;
                    
                    customer.debts.forEach((debt, index) => {
                        const isUnpaid = debt.remainingAmount > 0;
                        if (isUnpaid) hasUnpaid = true;
                        
                        const debtDate = new Date(debt.date);
                        const dateStr = debtDate.toLocaleDateString('fr-FR') + ' ' + debtDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
                        
                        html += `
                            <tr style="${isUnpaid ? 'background: #fff5f5;' : ''}">
                                <td>
                                    ${isUnpaid ? `
                                        <input type="checkbox" class="debt-checkbox" data-index="${index}" style="
                                            width: 18px;
                                            height: 18px;
                                            cursor: pointer;
                                            accent-color: var(--primary);
                                        ">
                                    ` : '✅'}
                                </td>
                                <td>${dateStr}</td>
                                <td>${debt.items.map(i => `${escapeHtml(i.name)}×${i.qty}`).join(', ')}</td>
                                <td><strong>${debt.totalAmount.toFixed(2)}</strong></td>
                                <td>${debt.paidAmount.toFixed(2)}</td>
                                <td style="color: ${isUnpaid ? 'var(--danger)' : 'var(--success)'}; font-weight: 700;">
                                    ${debt.remainingAmount.toFixed(2)}
                                </td>
                                <td>
                                    ${isUnpaid ? '⏳ En attente' : '✅ Payé'}
                                </td>
                            </tr>
                        `;
                    });
                    
                    if (DOM.customerDebtsBody) DOM.customerDebtsBody.innerHTML = html;
                    
                    if (DOM.btnPayDebt) {
                        DOM.btnPayDebt.style.display = hasUnpaid ? 'block' : 'none';
                        DOM.btnPayDebt.dataset.customerId = id;
                        DOM.btnPayDebt.innerHTML = hasUnpaid ? '💰 Payer les dettes sélectionnées' : '✅ Toutes les dettes sont payées';
                    }
                }

                if (DOM.customerDetailModal) DOM.customerDetailModal.classList.add('active');
                
            } catch (error) {
                console.error('View customer error:', error);
                showToast('❌ Erreur lors du chargement du client', 'error');
            }
        },
        
        delete: async function(id) {
            if (confirm('Supprimer ce client ?')) {
                try {
                    await dbDelete('customers', id);
                    showToast('✅ Client supprimé', 'success');
                    await loadCustomers();
                    await createAutoBackup();
                } catch (error) {
                    console.error('Delete customer error:', error);
                    showToast('❌ Échec de la suppression', 'error');
                }
            }
        },
        
        paySelected: async function(customerId) {
            const checkboxes = document.querySelectorAll('.debt-checkbox:checked');
            if (checkboxes.length === 0) {
                showToast('⚠️ Veuillez sélectionner au moins une dette', 'warning');
                return;
            }
            
            const customer = customers.find(c => c.id === customerId);
            if (!customer) {
                showToast('❌ Client non trouvé', 'error');
                return;
            }
            
            const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
            const selectedDebts = customer.debts.filter((d, i) => selectedIndices.includes(i));
            const totalToPay = selectedDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
            
            if (confirm(`Payer ${selectedDebts.length} dette(s) pour un total de ${totalToPay.toFixed(2)} ${settings.currency} ?`)) {
                try {
                    selectedDebts.forEach(debt => {
                        debt.remainingAmount = 0;
                        debt.paidAmount = debt.totalAmount;
                        debt.status = 'paid';
                    });
                    
                    await dbPut('customers', customer);
                    await loadCustomers();
                    await window._customer.view(customerId);
                    showToast(`✅ ${selectedDebts.length} dette(s) marquée(s) comme payée(s) !`, 'success');
                    playSuccess();
                    await createAutoBackup();
                    
                    if (currentView === 'analytics') {
                        loadAnalytics();
                    }
                } catch (error) {
                    console.error('Pay selected debts error:', error);
                    showToast('❌ Échec du paiement', 'error');
                }
            }
        },
        
        payAll: async function(customerId) {
            const customer = customers.find(c => c.id === customerId);
            if (!customer) {
                showToast('❌ Client non trouvé', 'error');
                return;
            }
            
            const unpaidDebts = customer.debts.filter(d => d.remainingAmount > 0);
            if (unpaidDebts.length === 0) {
                showToast('✅ Aucune dette impayée', 'info');
                return;
            }
            
            const totalRemaining = unpaidDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
            if (confirm(`Marquer TOUTES les dettes (${totalRemaining.toFixed(2)} ${settings.currency}) comme payées ?`)) {
                try {
                    unpaidDebts.forEach(debt => {
                        debt.remainingAmount = 0;
                        debt.paidAmount = debt.totalAmount;
                        debt.status = 'paid';
                    });
                    
                    await dbPut('customers', customer);
                    await loadCustomers();
                    await window._customer.view(customerId);
                    showToast('✅ Toutes les dettes marquées comme payées', 'success');
                    playSuccess();
                    await createAutoBackup();
                    
                    if (currentView === 'analytics') {
                        loadAnalytics();
                    }
                } catch (error) {
                    console.error('Pay all debts error:', error);
                    showToast('❌ Échec du paiement', 'error');
                }
            }
        },

        // ============================================================
        // SECTION 21.1: PARTIAL PAYMENT - REDUCE TOTAL DEBT
        // ============================================================
        partialPay: async function(customerId) {
            const customer = customers.find(c => c.id === customerId);
            if (!customer) {
                showToast('❌ Client non trouvé', 'error');
                return;
            }

            const amountInput = DOM.partialPaymentAmount;
            const paymentAmount = parseFloat(amountInput.value) || 0;

            if (paymentAmount <= 0) {
                showToast('⚠️ Veuillez entrer un montant valide', 'warning');
                return;
            }

            // Calculate total remaining debt
            const totalDebt = customer.debts ? customer.debts.reduce((sum, d) => sum + d.remainingAmount, 0) : 0;

            if (paymentAmount > totalDebt) {
                showToast(`⚠️ Le montant dépasse la dette totale (${totalDebt.toFixed(2)} ${settings.currency})`, 'warning');
                return;
            }

            if (confirm(`Appliquer un paiement de ${paymentAmount.toFixed(2)} ${settings.currency} sur la dette de ${customer.name} ?\nDette restante: ${(totalDebt - paymentAmount).toFixed(2)} ${settings.currency}`)) {
                try {
                    let remainingToPay = paymentAmount;

                    // Get unpaid debts sorted by date (oldest first)
                    const unpaidDebts = customer.debts
                        .filter(d => d.remainingAmount > 0)
                        .sort((a, b) => new Date(a.date) - new Date(b.date));

                    // Apply payment to debts in order (oldest first)
                    for (const debt of unpaidDebts) {
                        if (remainingToPay <= 0) break;

                        const debtRemaining = debt.remainingAmount;
                        if (remainingToPay >= debtRemaining) {
                            // Pay off this entire debt
                            remainingToPay -= debtRemaining;
                            debt.remainingAmount = 0;
                            debt.paidAmount = debt.totalAmount;
                            debt.status = 'paid';
                        } else {
                            // Partial payment on this debt - REDUCE THE REMAINING AMOUNT
                            debt.remainingAmount -= remainingToPay;
                            debt.paidAmount += remainingToPay;
                            remainingToPay = 0;
                        }
                    }

                    // Save updated customer
                    await dbPut('customers', customer);
                    
                    // Refresh data
                    await loadCustomers();
                    await window._customer.view(customerId);
                    
                    // Show success message
                    const newTotalDebt = customer.debts.reduce((sum, d) => sum + d.remainingAmount, 0);
                    showToast(`✅ Paiement partiel de ${paymentAmount.toFixed(2)} ${settings.currency} appliqué !\nDette restante: ${newTotalDebt.toFixed(2)} ${settings.currency}`, 'success');
                    playSuccess();
                    await createAutoBackup();

                    // Refresh analytics if open
                    if (currentView === 'analytics') {
                        loadAnalytics();
                    }

                } catch (error) {
                    console.error('Partial payment error:', error);
                    showToast('❌ Échec du paiement partiel', 'error');
                    playError();
                }
            }
        }
    };

    // ============================================================
    // SECTION 22: PAY DEBT BUTTON
    // ============================================================
    function setupPayDebtButton() {
        if (!DOM.btnPayDebt) return;

        DOM.btnPayDebt.addEventListener('click', async function() {
            const customerId = parseInt(this.dataset.customerId);
            if (!customerId) {
                showToast('❌ Aucun client sélectionné', 'error');
                return;
            }
            
            const checkboxes = document.querySelectorAll('.debt-checkbox:checked');
            if (checkboxes.length > 0) {
                await window._customer.paySelected(customerId);
            } else {
                await window._customer.payAll(customerId);
            }
        });
    }

    // ============================================================
    // SECTION 22.5: PARTIAL PAYMENT HANDLER
    // ============================================================
    function setupPartialPayment() {
        const amountInput = DOM.partialPaymentAmount;
        const btnPartial = DOM.btnPartialPayment;
        
        if (amountInput) {
            amountInput.addEventListener('input', function() {
                updatePartialPaymentRemaining();
            });
            
            // Allow Enter key to trigger payment
            amountInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const btn = DOM.btnPartialPayment;
                    if (btn) btn.click();
                }
            });
        }
        
        if (btnPartial) {
            btnPartial.addEventListener('click', function() {
                const customerId = viewingCustomerId;
                if (!customerId) {
                    showToast('❌ Aucun client sélectionné', 'error');
                    return;
                }
                window._customer.partialPay(customerId);
            });
        }
    }

    // ============================================================
    // SECTION 23: CUSTOMER MODAL CLOSE
    // ============================================================
    function setupCustomerModalClose() {
        if (DOM.btnCloseCustomerModal) {
            DOM.btnCloseCustomerModal.addEventListener('click', function() {
                if (DOM.customerDetailModal) DOM.customerDetailModal.classList.remove('active');
            });
        }

        if (DOM.customerDetailModal) {
            DOM.customerDetailModal.addEventListener('click', function(e) {
                if (e.target === this) {
                    DOM.customerDetailModal.classList.remove('active');
                }
            });
        }
    }

    // ============================================================
    // SECTION 24: CUSTOMER SEARCH
    // ============================================================
    function setupCustomerSearch() {
        if (DOM.customerSearch) {
            DOM.customerSearch.addEventListener('input', function() {
                renderCustomersList();
            });
        }
    }

    // ============================================================
    // SECTION 25: CUSTOMER SELECT
    // ============================================================
    function setupCustomerSelect() {
        if (DOM.customerSelect) {
            DOM.customerSelect.addEventListener('change', function() {
                const selectedId = parseInt(this.value);
                if (selectedId) {
                    const customer = customers.find(c => c.id === selectedId);
                    if (customer) {
                        if (DOM.checkoutCustomerName) DOM.checkoutCustomerName.textContent = customer.name;
                        const totalDebt = customer.debts ? customer.debts.reduce((sum, d) => sum + d.remainingAmount, 0) : 0;
                        if (totalDebt > 0) {
                            showToast(`💡 Ce client a une dette de ${totalDebt.toFixed(2)} ${settings.currency}`, 'warning');
                        }
                    }
                } else {
                    if (DOM.checkoutCustomerName) DOM.checkoutCustomerName.textContent = 'Client régulier';
                }
            });
        }
    }

    // ============================================================
    // SECTION 26: BULK DELETE CUSTOMERS
    // ============================================================
    function setupBulkDeleteCustomers() {
        if (DOM.btnBulkDeleteCustomers) {
            DOM.btnBulkDeleteCustomers.addEventListener('click', async function() {
                if (confirm('⚠️ Supprimer TOUS les clients ? Cette action est irréversible !')) {
                    try {
                        await dbClear('customers');
                        customers = [];
                        renderCustomersList();
                        populateCustomerSelect();
                        showToast('✅ Tous les clients supprimés', 'success');
                        await createAutoBackup();
                    } catch (error) {
                        console.error('Bulk delete customers error:', error);
                        showToast('❌ Échec de la suppression', 'error');
                    }
                }
            });
        }
    }

    // ============================================================
    // SECTION 27: NEW CUSTOMER BUTTON
    // ============================================================
    function setupNewCustomerButton() {
        if (DOM.btnNewCustomer) {
            DOM.btnNewCustomer.addEventListener('click', function() {
                switchView('customers');
                setTimeout(() => {
                    if (DOM.customerName) DOM.customerName.focus();
                }, 300);
            });
        }
    }

    // ============================================================
    // SECTION 28: BULK DELETE PRODUCTS
    // ============================================================
    function setupBulkDeleteProducts() {
        if (DOM.btnBulkDelete) {
            DOM.btnBulkDelete.addEventListener('click', async function() {
                if (confirm('⚠️ Supprimer TOUS les produits ? Cette action est irréversible !')) {
                    try {
                        await dbClear('products');
                        showToast('✅ Tous les produits supprimés', 'success');
                        await loadInventory();
                        await createAutoBackup();
                    } catch (error) {
                        console.error('Bulk delete error:', error);
                        showToast('❌ Échec de la suppression', 'error');
                    }
                }
            });
        }
    }

    // ============================================================
    // SECTION 29: ANALYTICS DASHBOARD
    // ============================================================
    async function loadAnalytics() {
        try {
            const sales = await dbGetAll('sales');
            const customersData = await dbGetAll('customers');

            let totalDebt = 0;
            let customersWithDebt = 0;
            customersData.forEach(c => {
                if (c.debts) {
                    const customerDebt = c.debts.reduce((sum, d) => sum + d.remainingAmount, 0);
                    if (customerDebt > 0) {
                        totalDebt += customerDebt;
                        customersWithDebt++;
                    }
                }
            });

            if (DOM.analyticsTotalDebt) {
                DOM.analyticsTotalDebt.textContent = `${totalDebt.toFixed(2)} ${settings.currency}`;
            }
            if (DOM.analyticsCustomersWithDebt) {
                DOM.analyticsCustomersWithDebt.textContent = customersWithDebt;
            }

            if (!sales || sales.length === 0) {
                if (DOM.analyticsBody) {
                    DOM.analyticsBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#999; padding:40px 0;">Aucune vente enregistrée</td></tr>';
                }
                if (DOM.analyticsRevenue) DOM.analyticsRevenue.textContent = `0.00 ${settings.currency}`;
                if (DOM.analyticsTransactions) DOM.analyticsTransactions.textContent = '0';
                if (DOM.analyticsItemsSold) DOM.analyticsItemsSold.textContent = '0';
                if (DOM.analyticsAverage) DOM.analyticsAverage.textContent = `0.00 ${settings.currency}`;
                return;
            }

            let totalRevenue = 0;
            let totalItemsSold = 0;

            const sortedSales = sales.sort((a, b) => {
                return new Date(b.timestamp) - new Date(a.timestamp);
            });

            let html = '';
            sortedSales.forEach(sale => {
                totalRevenue += sale.grandTotal;
                const itemCount = sale.items.reduce((sum, item) => sum + item.qty, 0);
                totalItemsSold += itemCount;

                const date = new Date(sale.timestamp);
                const formattedDate = date.toLocaleString('fr-FR');
                const itemSummary = sale.items.map(item => `${item.name}×${item.qty}`).join(', ');
                
                let statusText = '✅ Payé';
                let statusClass = 'status-paid';
                if (sale.isDebt) {
                    if (sale.remainingAmount > 0 && sale.amountPaid > 0) {
                        statusText = '⏳ Partiel';
                        statusClass = 'status-partial';
                    } else if (sale.remainingAmount > 0) {
                        statusText = '⚠️ Dette';
                        statusClass = 'status-debt';
                    }
                }

                html += `
                    <tr>
                        <td><strong>#${sale.id}</strong></td>
                        <td>${formattedDate}</td>
                        <td>${sale.customerName || 'Client régulier'}</td>
                        <td>${escapeHtml(itemSummary)}</td>
                        <td>${sale.grandTotal.toFixed(2)}</td>
                        <td>${sale.amountPaid.toFixed(2)}</td>
                        <td>${sale.remainingAmount.toFixed(2)}</td>
                        <td class="${statusClass}">${statusText}</td>
                    </tr>
                `;
            });

            if (DOM.analyticsBody) DOM.analyticsBody.innerHTML = html;
            
            const averageOrder = sales.length > 0 ? totalRevenue / sales.length : 0;
            
            if (DOM.analyticsRevenue) DOM.analyticsRevenue.textContent = `${totalRevenue.toFixed(2)} ${settings.currency}`;
            if (DOM.analyticsTransactions) DOM.analyticsTransactions.textContent = sales.length;
            if (DOM.analyticsItemsSold) DOM.analyticsItemsSold.textContent = totalItemsSold;
            if (DOM.analyticsAverage) DOM.analyticsAverage.textContent = `${averageOrder.toFixed(2)} ${settings.currency}`;

        } catch (error) {
            console.error('Load analytics error:', error);
            showToast('❌ Échec du chargement des analytics', 'error');
        }
    }

    // ============================================================
    // SECTION 30: EXPORT FUNCTIONS
    // ============================================================
    async function exportCSV() {
        try {
            const sales = await dbGetAll('sales');
            if (!sales || sales.length === 0) {
                showToast('❌ Aucune donnée à exporter', 'error');
                return;
            }

            let csv = 'ID Vente,Date,Client,Articles,Sous-total,TVA,Remise,Total,Payé,Reste,Statut\n';

            sales.forEach(sale => {
                const date = new Date(sale.timestamp).toLocaleString('fr-FR');
                const itemSummary = sale.items.map(item => `${item.name}×${item.qty}`).join('; ');
                const escapedSummary = `"${itemSummary.replace(/"/g, '""')}"`;
                const status = sale.isDebt ? (sale.remainingAmount > 0 ? 'Dette' : 'Payé') : 'Payé';
                csv += `${sale.id},"${date}","${sale.customerName || 'Client régulier'}",${escapedSummary},${sale.subtotal.toFixed(2)},${sale.vat.toFixed(2)},${(sale.discount || 0).toFixed(2)},${sale.grandTotal.toFixed(2)},${sale.amountPaid.toFixed(2)},${sale.remainingAmount.toFixed(2)},${status}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `ventes_export_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast('✅ CSV exporté avec succès !', 'success');
            playSuccess();

        } catch (error) {
            console.error('CSV export error:', error);
            showToast('❌ Échec de l\'export CSV', 'error');
            playError();
        }
    }

    async function exportJSON() {
        try {
            const sales = await dbGetAll('sales');
            const products = await dbGetAll('products');
            const customersData = await dbGetAll('customers');
            const settingsData = await dbGetAll('settings');
            
            const backup = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                sales: sales,
                products: products,
                customers: customersData,
                settings: settingsData
            };
            
            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `sauvegarde_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showToast('✅ Sauvegarde JSON exportée !', 'success');
            playSuccess();
            
        } catch (error) {
            console.error('JSON export error:', error);
            showToast('❌ Échec de l\'export JSON', 'error');
            playError();
        }
    }

    // ============================================================
    // SECTION 31: IMPORT FUNCTIONS
    // ============================================================
    function setupImportFunctions() {
        if (DOM.btnImportJson) {
            DOM.btnImportJson.addEventListener('click', function() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async function(e) {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        
                        if (!data.products && !data.sales) {
                            showToast('❌ Format de sauvegarde invalide', 'error');
                            return;
                        }
                        
                        if (confirm('⚠️ Cela va remplacer toutes les données actuelles. Continuer ?')) {
                            await dbClear('products');
                            await dbClear('sales');
                            await dbClear('customers');
                            await dbClear('settings');
                            
                            if (data.products && data.products.length > 0) {
                                for (const product of data.products) {
                                    await dbPut('products', product);
                                }
                            }
                            
                            if (data.sales && data.sales.length > 0) {
                                for (const sale of data.sales) {
                                    await dbPut('sales', sale);
                                }
                            }
                            
                            if (data.customers && data.customers.length > 0) {
                                for (const customer of data.customers) {
                                    await dbPut('customers', customer);
                                }
                            }
                            
                            if (data.settings && data.settings.length > 0) {
                                for (const setting of data.settings) {
                                    await dbPut('settings', setting);
                                }
                            }
                            
                            showToast('✅ Données importées avec succès !', 'success');
                            playSuccess();
                            
                            await loadSettings();
                            await loadInventory();
                            await loadCustomers();
                            await loadAnalytics();
                            renderCart();
                            await createAutoBackup();
                        }
                        
                    } catch (error) {
                        console.error('Import error:', error);
                        showToast('❌ Échec de l\'importation', 'error');
                        playError();
                    }
                };
                input.click();
            });
        }

        if (DOM.fileImportFull) {
            DOM.fileImportFull.addEventListener('change', async function(e) {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    if (!data.products && !data.sales) {
                        showToast('❌ Format de sauvegarde invalide', 'error');
                        return;
                    }
                    
                    if (confirm('⚠️ Cela va remplacer toutes les données actuelles. Continuer ?')) {
                        await dbClear('products');
                        await dbClear('sales');
                        await dbClear('customers');
                        await dbClear('settings');
                        
                        if (data.products && data.products.length > 0) {
                            for (const product of data.products) {
                                await dbPut('products', product);
                            }
                        }
                        
                        if (data.sales && data.sales.length > 0) {
                            for (const sale of data.sales) {
                                await dbPut('sales', sale);
                            }
                        }
                        
                        if (data.customers && data.customers.length > 0) {
                            for (const customer of data.customers) {
                                await dbPut('customers', customer);
                            }
                        }
                        
                        if (data.settings && data.settings.length > 0) {
                            for (const setting of data.settings) {
                                await dbPut('settings', setting);
                            }
                        }
                        
                        showToast('✅ Données importées avec succès !', 'success');
                        playSuccess();
                        
                        await loadSettings();
                        await loadInventory();
                        await loadCustomers();
                        await loadAnalytics();
                        renderCart();
                        await createAutoBackup();
                    }
                    
                } catch (error) {
                    console.error('Import error:', error);
                    showToast('❌ Échec de l\'importation', 'error');
                    playError();
                }
                
                DOM.fileImportFull.value = '';
            });
        }
    }

    // ============================================================
    // SECTION 32: SETTINGS EVENT HANDLERS
    // ============================================================
    function setupSettingsButtons() {
        if (DOM.btnSaveSettings) {
            DOM.btnSaveSettings.addEventListener('click', saveSettings);
        }
        
        if (DOM.btnResetSettings) {
            DOM.btnResetSettings.addEventListener('click', function() {
                if (DOM.settingsVat) DOM.settingsVat.value = DEFAULT_VAT_RATE;
                if (DOM.settingsLowStock) DOM.settingsLowStock.value = DEFAULT_LOW_STOCK;
                if (DOM.settingsCurrency) DOM.settingsCurrency.value = DEFAULT_CURRENCY;
                if (DOM.settingsFeedback) {
                    DOM.settingsFeedback.textContent = '↺ Paramètres par défaut chargés. Cliquez sur Sauvegarder pour appliquer.';
                    DOM.settingsFeedback.style.color = 'var(--info)';
                }
            });
        }

        if (DOM.btnResetAll) {
            DOM.btnResetAll.addEventListener('click', async function() {
                if (confirm('⚠️⚠️⚠️ RÉINITIALISER TOUTES LES DONNÉES ? Cette action est irréversible !')) {
                    if (confirm('Êtes-vous absolument sûr ?')) {
                        try {
                            await dbClear('products');
                            await dbClear('sales');
                            await dbClear('customers');
                            await dbClear('settings');
                            cart = [];
                            renderCart();
                            await loadSettings();
                            await loadInventory();
                            await loadCustomers();
                            await loadAnalytics();
                            localStorage.removeItem(BACKUP_KEY);
                            showToast('✅ Toutes les données ont été réinitialisées', 'success');
                        } catch (error) {
                            console.error('Reset all error:', error);
                            showToast('❌ Échec de la réinitialisation', 'error');
                        }
                    }
                }
            });
        }

        if (DOM.btnExportFullBackup) {
            DOM.btnExportFullBackup.addEventListener('click', exportJSON);
        }
    }

    // ============================================================
    // SECTION 33: CLEAR SALES
    // ============================================================
    function setupClearSales() {
        if (DOM.btnClearSales) {
            DOM.btnClearSales.addEventListener('click', async function() {
                if (confirm('⚠️ Supprimer TOUTES les ventes ? Cette action est irréversible !')) {
                    try {
                        await dbClear('sales');
                        showToast('✅ Toutes les ventes supprimées', 'success');
                        loadAnalytics();
                        await createAutoBackup();
                    } catch (error) {
                        console.error('Clear sales error:', error);
                        showToast('❌ Échec de la suppression', 'error');
                    }
                }
            });
        }
    }

    // ============================================================
    // SECTION 34: GLOBAL KEYBOARD INTERCEPTOR
    // ============================================================
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }
            if (currentView === 'checkout' && cart.length > 0) {
                e.preventDefault();
                completeTransaction();
            }
        }

        if (e.ctrlKey && e.key === 'i') {
            e.preventDefault();
            switchView('inventory');
        }
        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            switchView('checkout');
        }
        if (e.ctrlKey && e.key === 'a') {
            e.preventDefault();
            switchView('analytics');
        }
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            switchView('settings');
        }
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
            switchView('customers');
        }
    });

    // ============================================================
    // SECTION 35: CLOCK UPDATE
    // ============================================================
    function updateClock() {
        const now = new Date();
        if (DOM.clockDisplay) {
            DOM.clockDisplay.textContent = now.toLocaleTimeString('fr-FR', { hour12: false });
        }
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ============================================================
    // SECTION 36: MAIN BUTTON EVENT BINDINGS
    // ============================================================
    function setupMainButtons() {
        if (DOM.btnComplete) {
            DOM.btnComplete.addEventListener('click', completeTransaction);
        }
        if (DOM.btnClearCart) {
            DOM.btnClearCart.addEventListener('click', clearCart);
        }
        if (DOM.btnExportCsv) {
            DOM.btnExportCsv.addEventListener('click', exportCSV);
        }
        if (DOM.btnExportJson) {
            DOM.btnExportJson.addEventListener('click', exportJSON);
        }
    }

    // ============================================================
    // SECTION 37: AMOUNT PAID INPUT
    // ============================================================
    function setupAmountPaid() {
        if (DOM.amountPaidInput) {
            DOM.amountPaidInput.addEventListener('input', function() {
                updateRemainingAmount();
            });
        }
    }

    // ============================================================
    // SECTION 38: NAV TABS
    // ============================================================
    function setupNavTabs() {
        if (DOM.navTabs) {
            DOM.navTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    switchView(tab.dataset.view);
                });
            });
        }
    }

    // ============================================================
    // SECTION 39: FOCUS MANAGEMENT SETUP
    // ============================================================
    function setupFocusManagement() {
        document.addEventListener('click', function(e) {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
                return;
            }
            lockFocus();
        });

        setInterval(() => {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                return;
            }
            lockFocus();
        }, 2500);

        document.addEventListener('focusin', function(e) {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                focusLockEnabled = false;
                formInputActive = true;
            }
        });

        document.addEventListener('focusout', function(e) {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                setTimeout(() => {
                    focusLockEnabled = true;
                    formInputActive = false;
                }, 500);
            }
        });
    }

    // ============================================================
    // SECTION 40: PAYMENT STATUS BUTTONS SETUP
    // ============================================================
    function setupPaymentStatusButtons() {
        const btnPay = document.getElementById('btn-pay');
        const btnNotPay = document.getElementById('btn-not-pay');
        
        if (!btnPay || !btnNotPay) {
            const paymentButtons = document.querySelector('.payment-status-buttons');
            if (paymentButtons) {
                paymentButtons.innerHTML = `
                    <button class="btn btn-success" id="btn-pay" style="flex: 1; background: #e0e0e0; color: #333;">✅ Payé</button>
                    <button class="btn btn-danger" id="btn-not-pay" style="flex: 1; background: var(--danger); color: white;">❌ Non Payé</button>
                `;
            }
        }
        
        const payBtn = document.getElementById('btn-pay');
        const notPayBtn = document.getElementById('btn-not-pay');
        
        if (payBtn) {
            payBtn.addEventListener('click', function() {
                paymentStatus = 'paid';
                this.style.background = 'var(--success)';
                this.style.color = 'white';
                const notPay = document.getElementById('btn-not-pay');
                if (notPay) {
                    notPay.style.background = '#e0e0e0';
                    notPay.style.color = '#333';
                }
                showToast('✅ Paiement marqué comme payé', 'success');
                playSuccess();
            });
        }
        
        if (notPayBtn) {
            notPayBtn.addEventListener('click', function() {
                paymentStatus = 'unpaid';
                this.style.background = 'var(--danger)';
                this.style.color = 'white';
                const pay = document.getElementById('btn-pay');
                if (pay) {
                    pay.style.background = '#e0e0e0';
                    pay.style.color = '#333';
                }
                showToast('⚠️ Paiement marqué comme non payé', 'warning');
                playWarning();
            });
        }
    }

    // ============================================================
    // SECTION 41: APPLICATION INITIALIZATION
    // ============================================================
    async function initApp() {
        try {
            // Setup all event listeners
            setupScannerListeners();
            setupNavTabs();
            setupProductForm();
            setupEditForm();
            setupCustomerForm();
            setupCustomerSearch();
            setupCustomerSelect();
            setupNewCustomerButton();
            setupBulkDeleteCustomers();
            setupBulkDeleteProducts();
            setupPayDebtButton();
            setupPartialPayment();
            setupCustomerModalClose();
            setupImportFunctions();
            setupSettingsButtons();
            setupClearSales();
            setupMainButtons();
            setupAmountPaid();
            setupFocusManagement();
            setupPaymentStatusButtons();
            
            // Open database
            db = await openDB();
            console.log('✅ Base de données connectée:', DB_NAME);
            
            // Load all data
            await loadSettings();
            await loadInventory();
            await loadCustomers();
            await loadAnalytics();
            renderCart();

            // Auto-backup every 5 minutes
            setInterval(async () => {
                await createAutoBackup();
            }, 300000);

            // Reset payment buttons to default state
            resetPaymentButtons();

            setTimeout(lockFocus, 100);
            showToast('🧵 ShopPOS Pro prêt - Scannez un code-barres pour commencer !', 'success');

        } catch (error) {
            console.error('Init error:', error);
            showToast('❌ Échec de l\'initialisation: ' + error.message, 'error');
        }
    }

    // ============================================================
    // SECTION 42: START APPLICATION
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

})();