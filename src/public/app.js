/**
 * SupaCron Dashboard — Frontend Logic
 * Vanilla JS: polling, form handling, toast notifications, history table, routing, reports.
 */

(function () {
  'use strict';

  // ========== DOM References ==========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Layout & Navigation
  const sidebar       = $('#sidebar');
  const layoutWrapper = $('#layout-wrapper');
  const hamburgerBtn  = $('#hamburger-btn');
  const headerTitle   = $('#header-title');
  const navLinks      = $$('.nav-link');
  const pageViews     = $$('.page-view');

  // Metrics
  const statWaiting   = $('#stat-waiting');
  const statActive    = $('#stat-active');
  const statCompleted = $('#stat-completed');
  const statFailed    = $('#stat-failed');
  const redisStatus   = $('#redis-status');
  const redisLabel    = $('#redis-label');

  // Form elements
  const form          = $('#scheduler-form');
  const btnSubmit     = $('#btn-submit');
  const btnConnect    = $('#btn-connect');
  const connectText   = $('#connect-text');
  const supaUrl       = $('#supa-url');
  const supaKey       = $('#supa-key');
  const supaFunction  = $('#supa-function');
  const manualUrl     = $('#manual-url');
  const manualMethod  = $('#manual-method');

  const scheduleDelay = $('#schedule-delay');
  const scheduleCron  = $('#schedule-cron');
  const payload       = $('#payload');
  const jobName       = $('#job-name');

  // Tables
  const historyTable  = $('#history-table');
  const historyEmpty  = $('#history-empty');
  const activeJobsTable = $('#active-jobs-table');
  const activeEmpty     = $('#active-empty');

  // Filters
  const filterSearch = $('#filter-search');
  const filterStatus = $('#filter-status');
  const filterType   = $('#filter-type');

  // Mode sections
  const supabaseSection = $('#supabase-section');
  const manualSection   = $('#manual-section');
  const modeTabs        = $$('.mode-tab');

  // Reports
  const rTotalKpi     = $('#reports-total-kpi');
  const rSuccessKpi   = $('#reports-success-kpi');
  const rFailedKpi    = $('#reports-failed-kpi');
  const rDonut        = $('#reports-donut');
  const rSuccessRate  = $('#reports-success-rate');
  const rHistTotal    = $('#reports-hist-total');
  const rHistSuccess  = $('#reports-hist-success');
  const rHistFailed   = $('#reports-hist-failed');

  const toastContainer = $('#toast-container');

  let currentMode = 'supabase';
  let cachedLogs = [];

  // ========== Toast Notifications ==========
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ========== Sidebar & Routing ==========
  hamburgerBtn.addEventListener('click', () => {
    sidebar.classList.toggle('pinned');
    layoutWrapper.classList.toggle('sidebar-pinned');
  });

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Update active nav item
      navLinks.forEach(nav => nav.classList.remove('active'));
      link.classList.add('active');

      // Update Header Title
      headerTitle.textContent = link.dataset.title || 'SupaCron';

      // Show specific page view
      const targetPageId = link.dataset.page;
      pageViews.forEach(page => {
        if (page.id === targetPageId) {
          page.classList.add('active');
        } else {
          page.classList.remove('active');
        }
      });
    });
  });

  // ========== Mode Switcher ==========
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;
      if (currentMode === 'supabase') {
        supabaseSection.style.display = 'block';
        manualSection.style.display = 'none';
      } else {
        supabaseSection.style.display = 'none';
        manualSection.style.display = 'block';
      }
    });
  });

  // ========== Schedule Type Toggle ==========
  $$('input[name="schedule-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'delay') {
        scheduleDelay.style.display = '';
        scheduleCron.style.display = 'none';
      } else {
        scheduleDelay.style.display = 'none';
        scheduleCron.style.display = '';
      }
    });
  });

  // ========== Fetch Stats (Polling) ==========
  async function fetchStats() {
    try {
      const res = await fetch('/api/jobs/stats');
      if (!res.ok) throw new Error('Stats request failed');
      const data = await res.json();

      animateNumber(statWaiting, data.waiting || 0);
      animateNumber(statActive, data.active || 0);
      animateNumber(statCompleted, data.completed || 0);
      animateNumber(statFailed, data.failed || 0);

      redisStatus.classList.add('connected');
      redisStatus.classList.remove('disconnected');
      redisLabel.textContent = 'Redis Conectado';
    } catch {
      redisStatus.classList.remove('connected');
      redisStatus.classList.add('disconnected');
      redisLabel.textContent = 'Desconectado';
    }
  }

  function animateNumber(el, target) {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    el.textContent = target.toLocaleString();
    el.style.transition = 'transform 0.15s ease';
    el.style.transform = 'scale(1.1)';
    setTimeout(() => { el.style.transform = 'scale(1)'; }, 150);
  }

  // ========== Fetch Logs (History) & Filters ==========
  async function fetchLogs() {
    try {
      const res = await fetch('/api/jobs/logs');
      if (!res.ok) throw new Error('Logs request failed');
      cachedLogs = await res.json();
      applyFilters();
    } catch { }
  }

  function applyFilters() {
    const query = filterSearch.value.toLowerCase().trim();
    const status = filterStatus.value;
    const type = filterType.value;

    const filtered = cachedLogs.filter(log => {
      const matchesText = !query || 
        log.jobName.toLowerCase().includes(query) || 
        log.targetUrl.toLowerCase().includes(query) ||
        (log.jobId && log.jobId.toLowerCase().includes(query));

      const matchesStatus = status === 'all' || log.status === status;

      let matchesType = true;
      if (type !== 'all') {
        const isCron = log.jobId.includes('(');
        matchesType = type === 'cron' ? isCron : !isCron;
      }

      return matchesText && matchesStatus && matchesType;
    });

    renderHistory(filtered);
  }

  filterSearch.addEventListener('input', applyFilters);
  filterStatus.addEventListener('change', applyFilters);
  filterType.addEventListener('change', applyFilters);

  function renderHistory(logs) {
    if (!logs || logs.length === 0) {
      historyTable.innerHTML = '';
      historyEmpty.style.display = '';
      return;
    }
    historyEmpty.style.display = 'none';
    historyTable.innerHTML = logs.map(log => {
      const isSuccess = log.status === 'success';
      const badgeClass = isSuccess ? 'badge-success' : 'badge-failed';
      const badgeText = isSuccess ? '✓ Exitoso' : '✗ Fallido';
      const date = new Date(log.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `
        <tr>
          <td class="cell-id" title="${escapeHtml(log.jobId)}">${escapeHtml((log.jobId||'').substring(0,8))}</td>
          <td class="cell-name" title="${escapeHtml(log.jobName)}">${escapeHtml(log.jobName)}</td>
          <td class="cell-url" title="${escapeHtml(log.targetUrl)}">${escapeHtml(truncate(log.targetUrl, 35))}</td>
          <td><span class="badge ${badgeClass}">${badgeText}</span></td>
          <td class="cell-message" title="${escapeHtml(log.message || '')}">${escapeHtml(truncate(log.message || '—', 30))}</td>
          <td class="cell-date">${date}</td>
        </tr>
      `;
    }).join('');
  }

  // ========== Fetch Active/Vigentes Jobs ==========
  async function fetchActiveJobs() {
    try {
      const res = await fetch('/api/jobs/active');
      if (!res.ok) throw new Error('Active jobs request failed');
      const activeJobs = await res.json();
      renderActiveJobs(activeJobs);
    } catch { }
  }

  function renderActiveJobs(jobs) {
    if (!jobs || jobs.length === 0) {
      activeJobsTable.innerHTML = '';
      activeEmpty.style.display = '';
      return;
    }
    activeEmpty.style.display = 'none';
    activeJobsTable.innerHTML = jobs.map(job => {
      const typeBadge = job.type === 'cron' ? 'badge-success' : 'badge-failed';
      const typeText = job.type === 'cron' ? '🔁 Cron' : '🕐 Delay';
      return `
        <tr>
          <td class="cell-id" title="${escapeHtml(job.id)}">${escapeHtml((job.id||'').substring(0, 14))}</td>
          <td class="cell-name" title="${escapeHtml(job.name)}">${escapeHtml(job.name)}</td>
          <td><span class="badge ${typeBadge}">${typeText}</span></td>
          <td style="font-weight:600; color:var(--text-primary); font-size:0.75rem;">${escapeHtml(job.detail)}</td>
          <td class="cell-url" title="${escapeHtml(job.targetUrl)}">${escapeHtml(truncate(job.targetUrl, 25))}</td>
          <td>
            <button class="btn-danger-outline btn-cancel-job" data-id="${escapeHtml(job.id)}">🗑️ Cancelar</button>
          </td>
        </tr>
      `;
    }).join('');

    $$('.btn-cancel-job').forEach(btn => {
      btn.addEventListener('click', async () => {
        await cancelJob(btn.dataset.id, btn);
      });
    });
  }

  async function cancelJob(jobId, buttonElement) {
    if (!confirm('¿Estás seguro de que deseas cancelar y eliminar esta tarea programada?')) return;
    buttonElement.disabled = true;
    buttonElement.textContent = '⏳ ...';
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cancelar la tarea');
      showToast('Tarea cancelada exitosamente', 'success');
      fetchActiveJobs();
      fetchStats();
    } catch (err) {
      showToast(err.message, 'error');
      buttonElement.disabled = false;
      buttonElement.textContent = '🗑️ Cancelar';
    }
  }

  // ========== Fetch Reports ==========
  async function fetchReports() {
    try {
      const res = await fetch('/api/jobs/reports');
      if (!res.ok) throw new Error('Reports request failed');
      const data = await res.json();
      
      const { historical, today } = data;

      // Actualizar números históricos
      rHistTotal.textContent = historical.total.toLocaleString();
      rHistSuccess.textContent = historical.successful.toLocaleString();
      rHistFailed.textContent = historical.failed.toLocaleString();

      // Actualizar números de hoy
      rTotalKpi.textContent = today.total.toLocaleString();
      rFailedKpi.textContent = today.failed.toLocaleString();

      // Calcular tasa de éxito global
      let successRate = 0;
      if (historical.total > 0) {
        successRate = Math.round((historical.successful / historical.total) * 100);
      }
      rSuccessKpi.textContent = `${successRate}%`;
      rSuccessRate.textContent = `${successRate}%`;

      // Actualizar gráfico de dona via conic-gradient CSS
      // El verde va de 0% al successRate%, el rojo del successRate% al 100%
      rDonut.style.background = `conic-gradient(var(--accent) 0% ${successRate}%, var(--danger) ${successRate}% 100%)`;

    } catch (err) {
      // Silently fail
    }
  }

  // ========== Utilities ==========
  function truncate(str, maxLen) {
    if (!str) return '—';
    return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
  }
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========== Connect to Supabase ==========
  btnConnect.addEventListener('click', async () => {
    const url = supaUrl.value.trim();
    const key = supaKey.value.trim();
    if (!url || !key) return showToast('Ingresa la URL y la Service Role Key de tu proyecto', 'error');

    btnConnect.disabled = true;
    connectText.textContent = '⏳ Conectando…';

    try {
      const res = await fetch(`/api/supabase/functions?supabaseUrl=${encodeURIComponent(url)}&serviceRoleKey=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al conectar con Supabase');

      supaFunction.innerHTML = '<option value="">— Selecciona una función —</option>';
      if (data.functions && data.functions.length > 0) {
        data.functions.forEach(fn => {
          const opt = document.createElement('option');
          opt.value = fn.slug;
          opt.textContent = `${fn.name || fn.slug} (${fn.status || 'active'})`;
          supaFunction.appendChild(opt);
        });
        supaFunction.disabled = false;
        showToast(`${data.functions.length} funciones cargadas correctamente`, 'success');
      } else {
        supaFunction.innerHTML = '<option value="">— No se encontraron funciones —</option>';
        showToast('No se encontraron Edge Functions en este proyecto', 'info');
      }
    } catch (err) {
      showToast(err.message, 'error');
      supaFunction.innerHTML = '<option value="">— Error al cargar —</option>';
    } finally {
      btnConnect.disabled = false;
      connectText.textContent = '🔌 Conectar y Cargar Funciones';
    }
  });

  // ========== Submit Form ==========
  form.addEventListener('submit', async (e) => { e.preventDefault(); await submitJob(); });
  btnSubmit.addEventListener('click', async (e) => { e.preventDefault(); await submitJob(); });

  async function submitJob() {
    let target;
    let name = jobName.value.trim() || 'Tarea SupaCron';
    let body = undefined;
    const rawPayload = payload.value.trim();
    if (rawPayload) {
      try { body = JSON.parse(rawPayload); } 
      catch { return showToast('El Payload no es un JSON válido. Revisa la sintaxis.', 'error'); }
    }

    if (currentMode === 'supabase') {
      const url = supaUrl.value.trim();
      const key = supaKey.value.trim();
      const fnSlug = supaFunction.value;
      if (!url || !key) return showToast('Conecta tu proyecto Supabase primero', 'error');
      if (!fnSlug) return showToast('Selecciona una Edge Function', 'error');
      target = { supabase: { url, key, functionSlug: fnSlug }, payload: body };
    } else {
      const url = manualUrl.value.trim();
      const method = manualMethod.value;
      if (!url) return showToast('Ingresa la URL destino del webhook', 'error');
      target = { url, method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body } : {}) };
    }

    const schedType = document.querySelector('input[name="schedule-type"]:checked').value;
    let schedule = undefined;
    if (schedType === 'delay') {
      const secs = parseInt(scheduleDelay.value);
      if (secs && secs > 0) schedule = { type: 'delay', delaySeconds: secs };
    } else {
      const expr = scheduleCron.value.trim();
      if (expr) schedule = { type: 'cron', expression: expr };
    }

    const requestBody = { name };
    if (currentMode === 'supabase') {
      requestBody.supabase = target.supabase;
      requestBody.payload = target.payload;
    } else {
      requestBody.target = target;
    }
    if (schedule) requestBody.schedule = schedule;

    btnSubmit.classList.add('loading');
    btnSubmit.disabled = true;

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear la tarea');
      
      showToast(`Tarea "${name}" programada exitosamente (ID: ${data.jobId})`, 'success');
      
      payload.value = '';
      jobName.value = '';
      scheduleDelay.value = '';
      scheduleCron.value = '';

      fetchStats();
      fetchLogs();
      fetchActiveJobs();
      fetchReports();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnSubmit.classList.remove('loading');
      btnSubmit.disabled = false;
    }
  }

  payload.addEventListener('input', () => {
    const raw = payload.value.trim();
    if (!raw) { payload.style.borderColor = ''; return; }
    try { JSON.parse(raw); payload.style.borderColor = 'var(--accent)'; } 
    catch { payload.style.borderColor = 'var(--danger)'; }
  });

  // ========== Init ==========
  fetchStats();
  fetchLogs();
  fetchActiveJobs();
  fetchReports();
  
  setInterval(fetchStats, 5000);
  setInterval(fetchLogs, 5000);
  setInterval(fetchActiveJobs, 2000);
  setInterval(fetchReports, 5000);

})();
