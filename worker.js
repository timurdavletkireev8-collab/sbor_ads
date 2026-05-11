export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // --- API ---
    if (pathname === "/api/user" && request.method === "POST") {
      const { userId, firstName, username } = await request.json();
      await env.DB.prepare(`
        INSERT INTO users (userId, firstName, username, lastActive)
        VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
        ON CONFLICT(userId) DO UPDATE SET firstName = ?2, username = ?3, lastActive = CURRENT_TIMESTAMP
      `).bind(userId, firstName, username).run();
      
      const user = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
      const stats = await env.DB.prepare("SELECT views FROM stats WHERE id = 'global'").bind().first();
      return new Response(JSON.stringify({ user, stats }), { headers: { "Content-Type": "application/json" } });
    }

    if (pathname === "/api/reward" && request.method === "POST") {
      const { userId } = await request.json();
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET balance = balance + 10, totalAdsWatched = totalAdsWatched + 1 WHERE userId = ?").bind(userId),
        env.DB.prepare("UPDATE stats SET views = views + 1 WHERE id = 'global'")
      ]);
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (pathname === "/api/rating") {
      const type = new URL(request.url).searchParams.get('type') || 'balance';
      const orderField = type === 'referrals' ? 'referrals' : 'balance';
      const { results } = await env.DB.prepare(`SELECT firstName, balance, referrals FROM users ORDER BY ${orderField} DESC LIMIT 20`).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    // --- HTML & UI ---
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Lume System</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script src="https://sad.adsgram.ai/js/sad.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { 
            --bg: #000000; 
            --card-bg: #111111; 
            --border: #222222; 
            --text: #ffffff; 
            --text-dim: #888888; 
            --primary: #ffffff; 
            --primary-invert: #000000; 
        }
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { font-family: 'Manrope', sans-serif; background-color: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        
        /* Layout & Animations */
        .content-area { flex: 1; overflow-y: auto; padding: 20px 20px 100px 20px; display: none; opacity: 0; animation: fadeIn 0.3s forwards ease-out; }
        .content-area.active { display: block; }
        @keyframes fadeIn { to { opacity: 1; transform: translateY(0); } from { opacity: 0; transform: translateY(5px); } }
        
        /* Strict Monochrome Cards */
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
        .section-title { font-size: 24px; font-weight: 800; margin-bottom: 10px; letter-spacing: -0.5px; }
        .section-desc { font-size: 13px; color: var(--text-dim); margin-bottom: 24px; line-height: 1.6; }

        /* User Header */
        .user-mini { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
        .avatar { width: 48px; height: 48px; border-radius: 12px; background: var(--card-bg); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: var(--text); }
        .user-meta h3 { font-size: 16px; font-weight: 800; letter-spacing: -0.5px; }
        .user-meta p { font-size: 12px; color: var(--text-dim); margin-top: 2px; }

        /* Balance & Progress */
        .balance-val { font-size: 48px; font-weight: 800; letter-spacing: -2px; text-align: center; margin: 12px 0; color: var(--text); }
        .progress-header { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 10px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }
        .progress-track { height: 6px; background: var(--border); border-radius: 6px; overflow: hidden; margin-bottom: 10px; }
        .progress-fill { height: 100%; width: 0%; background: var(--primary); transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }

        /* Buttons */
        .btn-primary { width: 100%; padding: 18px; border-radius: 14px; border: none; background: var(--primary); color: var(--primary-invert); font-weight: 800; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: transform 0.15s, opacity 0.15s; }
        .btn-primary:active { transform: scale(0.98); opacity: 0.9; }
        .btn-outline { width: 100%; padding: 16px; border-radius: 14px; border: 1px solid var(--border); background: transparent; color: var(--text); font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 12px; transition: background 0.15s; }
        .btn-outline:active { background: var(--card-bg); }
        
        /* Toggle Switch */
        .toggle-container { display: flex; background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 4px; margin-bottom: 20px; }
        .toggle-btn { flex: 1; padding: 12px; text-align: center; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--text-dim); transition: 0.2s; cursor: pointer; }
        .toggle-btn.active { background: var(--border); color: var(--text); }

        /* Lists */
        .list-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--border); }
        .list-row:last-child { border-bottom: none; }
        .list-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--border); color: var(--text); display: flex; align-items: center; justify-content: center; font-size: 16px; }

        /* Bottom Nav */
        .nav-dock { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(0, 0, 0, 0.9); backdrop-filter: blur(10px); border-top: 1px solid var(--border); padding: 12px 10px 25px; display: flex; justify-content: space-between; z-index: 100; }
        .nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--text-dim); transition: color 0.2s; cursor: pointer; }
        .nav-item i { font-size: 18px; transition: transform 0.2s; }
        .nav-item span { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .nav-item.active { color: var(--text); }
        .nav-item.active i { transform: translateY(-2px); }
    </style>
</head>
<body>

    <!-- ТАБ 1: РЕКЛАМА -->
    <div id="tabAds" class="content-area active">
        <div class="user-mini">
            <div class="avatar" id="avAds">L</div>
            <div class="user-meta">
                <h3 id="nameAds">Загрузка...</h3>
                <p id="idAds">Идентификатор: ...</p>
            </div>
        </div>
        <div class="card">
            <p style="text-align:center; font-size:11px; color:var(--text-dim); font-weight:600; text-transform:uppercase; letter-spacing:1px;">Текущий баланс</p>
            <div class="balance-val" id="balanceMain">0</div>
            <p style="text-align:center; font-size:13px; font-weight:800; margin-bottom:24px; color:var(--text); letter-spacing:2px;">LUME</p>
            
            <div class="progress-header">
                <span>Цель сообщества: 100 000</span>
                <span id="percentMain">0%</span>
            </div>
            <div class="progress-track"><div class="progress-fill" id="fillMain"></div></div>
            <p style="font-size:11px; color:var(--text-dim); text-align:right; margin-top: 8px;">Всего просмотров: <span id="viewsMain" style="color:var(--text); font-weight: 600;">0</span></p>
        </div>
        <button class="btn-primary" id="btnWatchAd">
            <i class="fas fa-play"></i> Инициировать просмотр
        </button>
        <p style="text-align:center; font-size:12px; color:var(--text-dim); margin-top:20px; line-height: 1.6;">
            Система монетизации внимания. Каждый просмотренный материал автоматически конвертируется во внутренний актив платформы, увеличивая вашу долю в будущей экосистеме.
        </p>
    </div>

    <!-- ТАБ 2: ЗАДАНИЯ -->
    <div id="tabTasks" class="content-area">
        <h2 class="section-title">Микрозадачи</h2>
        <p class="section-desc">Дополнительные инструменты для увеличения вашего капитала внутри системы через взаимодействие с партнерскими проектами.</p>
        <div class="card" style="text-align:center; padding: 40px 20px; border: 1px dashed var(--text-dim); background:transparent;">
            <i class="fas fa-network-wired" style="font-size:32px; color:var(--text-dim); margin-bottom:16px;"></i>
            <h3 style="font-size:16px; margin-bottom:12px;">Интеграция протоколов</h3>
            <p style="font-size:13px; color:var(--text-dim); line-height: 1.6;">Раздел находится в стадии технической интеграции с провайдерами (------). Вскоре здесь будут доступны предложения, которые позволят кратно увеличить ваш доход.</p>
        </div>
    </div>

    <!-- ТАБ 3: РЕФЕРАЛЫ -->
    <div id="tabRefs" class="content-area">
        <h2 class="section-title">Партнерская сеть</h2>
        <p class="section-desc">Масштабируйте свой доход. Наша архитектура предусматривает двухуровневую систему вознаграждений, обеспечивая пассивный доход от активности вашей структуры.</p>
        
        <div class="card">
            <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
                <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px; text-transform:uppercase; font-weight:600;">Первый уровень (Прямые)</div>
                <div style="font-size:24px; font-weight:800; color:var(--text);">15%</div>
                <div style="font-size:12px; color:var(--text-dim); margin-top:4px;">Доля от валового дохода пользователей, зарегистрированных по вашей ссылке.</div>
            </div>
            <div>
                <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px; text-transform:uppercase; font-weight:600;">Второй уровень (Структура)</div>
                <div style="font-size:24px; font-weight:800; color:var(--text);">5%</div>
                <div style="font-size:12px; color:var(--text-dim); margin-top:4px;">Дополнительные начисления от активности участников, приглашенных вашей первой линией.</div>
            </div>
        </div>

        <div class="card">
            <div class="list-row">
                <div class="list-icon"><i class="fas fa-users"></i></div>
                <div style="flex:1;"><div style="font-weight:600; font-size:14px;">Размер вашей структуры</div></div>
                <div style="font-weight:800; font-size:18px;" id="refCount">0</div>
            </div>
        </div>

        <button class="btn-primary" onclick="shareRef()" style="margin-bottom:12px;">
            <i class="fas fa-share-nodes"></i> Отправить приглашение
        </button>
        <button class="btn-outline" onclick="copyRef()">
            <i class="fas fa-copy"></i> Скопировать адрес
        </button>
    </div>

    <!-- ТАБ 4: РЕЙТИНГ -->
    <div id="tabRating" class="content-area">
        <h2 class="section-title">Глобальный рейтинг</h2>
        <p class="section-desc">Отслеживайте позиции самых активных участников. Статус в рейтинге может быть учтен при будущем распределении активов системы.</p>
        
        <div class="toggle-container">
            <div class="toggle-btn active" id="tgBal" onclick="loadRating('balance')">По капиталу</div>
            <div class="toggle-btn" id="tgRef" onclick="loadRating('referrals')">По структуре</div>
        </div>
        
        <div class="card" style="padding: 10px 20px;" id="ratingList">
            <div style="text-align:center; padding:20px; color:var(--text-dim);"><i class="fas fa-circle-notch fa-spin"></i> Синхронизация...</div>
        </div>
    </div>

    <!-- ТАБ 5: ПРОФИЛЬ -->
    <div id="tabProfile" class="content-area">
        <h2 class="section-title">Профиль</h2>
        <p class="section-desc">Статистические данные вашего аккаунта и управление операциями.</p>

        <div class="card" style="display:flex; align-items:center; gap:16px;">
            <div class="avatar" id="avProf" style="width:64px; height:64px; font-size:24px;">L</div>
            <div>
                <h3 id="nameProf" style="font-size:18px; margin-bottom:6px;">User</h3>
                <p style="font-size:12px; color:var(--text-dim);" id="idProf">Идентификатор: ...</p>
            </div>
        </div>
        
        <div class="card">
            <div class="list-row">
                <div style="flex:1; color:var(--text-dim); font-size:14px;">Активный капитал</div>
                <div style="font-weight:800; color:var(--text);" id="profBal">0 LUME</div>
            </div>
            <div class="list-row">
                <div style="flex:1; color:var(--text-dim); font-size:14px;">Обработано материалов</div>
                <div style="font-weight:800; color:var(--text);" id="profAds">0</div>
            </div>
        </div>

        <button class="btn-outline" style="margin-top:24px; border-color:var(--border); color:var(--text-dim);" onclick="alert('Модуль вывода средств заблокирован до официального релиза платформы и запуска токена.')">
            <i class="fas fa-wallet"></i> Запросить вывод средств
        </button>
    </div>

    <!-- ТАБ 6: ИНФОРМАЦИЯ -->
    <div id="tabInfo" class="content-area">
        <h2 class="section-title">О проекте</h2>
        <p class="section-desc">Официальная информация, обновления платформы и связь с разработчиками.</p>

        <div class="card">
            <h3 style="font-size:16px; margin-bottom:12px;">Архитектура LUME</h3>
            <p style="font-size:13px; color:var(--text-dim); margin-bottom:12px; line-height:1.6;">
                Мы создаем прозрачную экономическую модель. Рекламодатели инвестируют во внимание аудитории, а пользователи получают прямую долю дохода за взаимодействие с контентом. Средства аккумулируются и распределяются алгоритмически.
            </p>
            <p style="font-size:13px; color:var(--text-dim); line-height:1.6;">
                Стратегическая цель платформы — выпуск утилитарного токена и его листинг на децентрализованных площадках. Накопление баллов на текущем этапе обеспечит максимальное преимущество при конвертации.
            </p>
        </div>

        <button class="btn-primary" onclick="tg.openTelegramLink('https://t.me/ТУТ_ТВОЙ_КАНАЛ')" style="margin-bottom:12px;">
            <i class="fas fa-bullhorn"></i> Новостной канал
        </button>
        <button class="btn-outline" onclick="tg.openTelegramLink('https://t.me/ТУТ_ТВОЙ_САППОРТ')">
            <i class="fas fa-headset"></i> Служба поддержки
        </button>
    </div>

    <!-- НАВИГАЦИЯ -->
    <div class="nav-dock">
        <div class="nav-item active" onclick="switchTab('tabAds', this)"><i class="fas fa-play"></i><span>Реклама</span></div>
        <div class="nav-item" onclick="switchTab('tabTasks', this)"><i class="fas fa-list"></i><span>Задания</span></div>
        <div class="nav-item" onclick="switchTab('tabRefs', this)"><i class="fas fa-network-wired"></i><span>Сеть</span></div>
        <div class="nav-item" onclick="switchTab('tabRating', this)"><i class="fas fa-chart-simple"></i><span>Рейтинг</span></div>
        <div class="nav-item" onclick="switchTab('tabProfile', this)"><i class="fas fa-user"></i><span>Профиль</span></div>
        <div class="nav-item" onclick="switchTab('tabInfo', this)"><i class="fas fa-info-circle"></i><span>Инфо</span></div>
    </div>

<script>
    const tg = window.Telegram.WebApp;
    tg.expand();
    const user = tg.initDataUnsafe?.user || { id: '123456', first_name: 'Пользователь', username: 'guest' };
    const userId = user.id.toString();
    const botUsername = 'ТУТ_ЮЗЕРНЕЙМ_ТВОЕГО_БОТА'; // Без @

    // Синхронизация данных
    async function syncData() {
        const r = await fetch('/api/user', {
            method: 'POST', body: JSON.stringify({ userId, firstName: user.first_name, username: user.username })
        });
        const d = await r.json();
        const u = d.user;
        const s = d.stats;

        document.getElementById('balanceMain').textContent = u.balance.toLocaleString();
        document.getElementById('profBal').textContent = u.balance.toLocaleString() + ' LUME';
        document.getElementById('profAds').textContent = u.totalAdsWatched || 0;
        document.getElementById('refCount').textContent = u.referrals || 0;
        
        document.getElementById('nameAds').textContent = u.firstName;
        document.getElementById('nameProf').textContent = u.firstName;
        document.getElementById('idAds').textContent = 'ID: ' + userId;
        document.getElementById('idProf').textContent = 'ID: ' + userId;
        
        const initial = u.firstName.charAt(0).toUpperCase();
        document.getElementById('avAds').textContent = initial;
        document.getElementById('avProf').textContent = initial;

        const p = Math.min((s.views / 100000) * 100, 100);
        document.getElementById('percentMain').textContent = p.toFixed(1) + '%';
        document.getElementById('fillMain').style.width = p + '%';
        document.getElementById('viewsMain').textContent = s.views.toLocaleString();
    }

    // Реклама
    const Ads = window.Adsgram.init({ blockId: "24601" });
    document.getElementById('btnWatchAd').onclick = async () => {
        tg.HapticFeedback.impactOccurred('medium');
        try {
            await Ads.show();
            await fetch('/api/reward', { method: 'POST', body: JSON.stringify({ userId }) });
            tg.HapticFeedback.notificationOccurred('success');
            syncData();
        } catch(e) { tg.HapticFeedback.notificationOccurred('error'); }
    };

    // Навигация
    window.switchTab = (tabId, element) => {
        tg.HapticFeedback.impactOccurred('light');
        document.querySelectorAll('.content-area').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        
        document.getElementById(tabId).classList.add('active');
        element.classList.add('active');

        if(tabId === 'tabRating') loadRating('balance');
    };

    // Рейтинг
    window.loadRating = async (type) => {
        tg.HapticFeedback.selectionChanged();
        document.getElementById('tgBal').classList.toggle('active', type === 'balance');
        document.getElementById('tgRef').classList.toggle('active', type === 'referrals');
        document.getElementById('ratingList').innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim);"><i class="fas fa-circle-notch fa-spin"></i></div>';
        
        const r = await fetch('/api/rating?type=' + type);
        const list = await r.json();
        
        let html = '';
        list.forEach((u, i) => {
            const val = type === 'balance' ? u.balance + ' LUME' : (u.referrals || 0) + ' реф.';
            html += \`
            <div class="list-row" style="padding: 12px 0;">
                <div style="font-weight:800; color:var(--text-dim); width:30px; font-size:14px;">#\${i+1}</div>
                <div style="flex:1; font-weight:600; font-size:15px; color:var(--text);">\${u.firstName}</div>
                <div style="font-weight:800; color:var(--text); font-size:14px;">\${val}</div>
            </div>\`;
        });
        document.getElementById('ratingList').innerHTML = html || '<div style="text-align:center; padding:10px; color:var(--text-dim);">Данные отсутствуют</div>';
    };

    // Реферальная система
    const refUrl = \`https://t.me/\${botUsername}?start=\${userId}\`;
    const refText = 'Присоединяйтесь к платформе LUME. Монетизация внимания и двухуровневая партнерская структура.';
    
    window.shareRef = () => {
        tg.HapticFeedback.impactOccurred('light');
        tg.openTelegramLink(\`https://t.me/share/url?url=\${encodeURIComponent(refUrl)}&text=\${encodeURIComponent(refText)}\`);
    };
    
    window.copyRef = () => {
        navigator.clipboard.writeText(refUrl);
        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert('Адрес скопирован в буфер обмена.');
    };

    syncData();
</script>
</body>
</html>
    `;

    return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }
};
