/**
 * SupaCron Dashboard — Frontend Logic
 * Vanilla JS: polling, form handling, toast notifications, history table.
 */

(function () {
  'use strict';

  // ========== DOM References ==========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const statWaiting   = $('#stat-waiting');
  const statActive    = $('#stat-active');
  const statCompleted = $('#stat-completed');
  const statFailed    = $('#stat-failed');
  const redisStatus   = $('#redis-status');
  const redisLabel    = $('#redis-label');

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
  const historyTable  = $('#history-table');
  const historyEmpty  = $('#history-empty');
  const toastContainer = $('#toast-container');

  // Active Jobs references
  const activeJobsTable = $('#active-jobs-table');
  const activeEmpty     = $('#active-empty');

  // Filters references
  const filterSearch = $('#filter-search');
  const filterStatus = $('#filter-status');
  const filterType   = $('#filter-type');

  // Mode sections
  const supabaseSection = $('#supabase-section');
  const manualSection   = $('#manual-section');
  const modeTabs        = $$('.mode-tab');

  let currentMode = 'supabase';
  let cachedLogs = []; // Guardar los logs originales para filtrar en el cliente

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

  // ========== Mode Switcher ==========
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;

      if (currentMode === 'supabase') {
        supabaseSection.classList.add('visible');
        manualSection.classList.remove('visible');
      } else {
        supabaseSection.classList.remove('visible');
        manualSection.classList.add('visible');
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

      // Redis is connected if we got a response
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
    } catch {
      // Silently fail
    }
  }

  function applyFilters() {
    const query = filterSearch.value.toLowerCase().trim();
    const status = filterStatus.value;
    const type = filterType.value;

    const filtered = cachedLogs.filter(log => {
      // Filtro por búsqueda de texto
      const matchesText = !query || 
        log.jobName.toLowerCase().includes(query) || 
        log.targetUrl.toLowerCase().includes(query) ||
        (log.jobId && log.jobId.toLowerCase().includes(query));

      // Filtro por estado (success / failed)
      const matchesStatus = status === 'all' || log.status === status;

      // Filtro por tipo (cron / delay)
      let matchesType = true;
      if (type !== 'all') {
        const isCron = log.jobId.includes('('); // Las repetitivas tienen el formato baseId(N)
        matchesType = type === 'cron' ? isCron : !isCron;
      }

      return matchesText && matchesStatus && matchesType;
    });

    renderHistory(filtered);
  }

  // Listeners para filtros
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
      const date = new Date(log.createdAt).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
      const shortId = log.jobId || '';
      const shortUrl = truncate(log.targetUrl, 35);
      const message = truncate(log.message || '—', 30);

      return `
        <tr>
          <td class="cell-id" title="${escapeHtml(log.jobId)}">${escapeHtml(shortId)}</td>
          <td class="cell-name" title="${escapeHtml(log.jobName)}">${escapeHtml(log.jobName)}</td>
          <td class="cell-url" title="${escapeHtml(log.targetUrl)}">${escapeHtml(shortUrl)}</td>
          <td><span class="badge ${badgeClass}">${badgeText}</span></td>
          <td class="cell-message" title="${escapeHtml(log.message || '')}">${escapeHtml(message)}</td>
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
    } catch {
      // Silently fail
    }
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
      const cleanId = (job.id || '').substring(0, 14); // Truncar IDs crudos muy largos de redis

      return `
        <tr>
          <td class="cell-id" title="${escapeHtml(job.id)}">${escapeHtml(cleanId)}</td>
          <td class="cell-name" title="${escapeHtml(job.name)}">${escapeHtml(job.name)}</td>
          <td><span class="badge ${typeBadge}">${typeText}</span></td>
          <td style="font-weight:600; color:var(--text-primary); font-size:0.75rem;">${escapeHtml(job.detail)}</td>
          <td class="cell-url" title="${escapeHtml(job.targetUrl)}">${escapeHtml(truncate(job.targetUrl, 25))}</td>
          <td>
            <button class="btn-danger-outline btn-cancel-job" data-id="${escapeHtml(job.id)}">
              🗑️ Cancelar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Asignar listeners a los botones de cancelar recién creados
    $$('.btn-cancel-job').forEach(btn => {
      btn.addEventListener('click', async () => {
        const jobId = btn.dataset.id;
        await cancelJob(jobId, btn);
      });
    });
  }

  // ========== Cancel Job Action ==========
  async function cancelJob(jobId, buttonElement) {
    if (!confirm('¿Estás seguro de que deseas cancelar y eliminar esta tarea programada?')) return;

    buttonElement.disabled = true;
    buttonElement.textContent = '⏳ ...';

    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error al cancelar la tarea');

      showToast('Tarea cancelada exitosamente', 'success');
      
      // Refresh inmediato
      fetchActiveJobs();
      fetchStats();
    } catch (err) {
      showToast(err.message, 'error');
      buttonElement.disabled = false;
      buttonElement.textContent = '🗑️ Cancelar';
    }
  }

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

    if (!url || !key) {
      showToast('Ingresa la URL y la Service Role Key de tu proyecto', 'error');
      return;
    }

    btnConnect.disabled = true;
    connectText.textContent = '⏳ Conectando…';

    try {
      const res = await fetch(`/api/supabase/functions?supabaseUrl=${encodeURIComponent(url)}&serviceRoleKey=${encodeURIComponent(key)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al conectar con Supabase');
      }

      // Populate select
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
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitJob();
  });

  btnSubmit.addEventListener('click', async (e) => {
    e.preventDefault();
    await submitJob();
  });

  async function submitJob() {
    // Build the job body
    let target;
    let name = jobName.value.trim() || 'Tarea SupaCron';

    // Parse payload
    let body = undefined;
    const rawPayload = payload.value.trim();
    if (rawPayload) {
      try {
        body = JSON.parse(rawPayload);
      } catch {
        showToast('El Payload no es un JSON válido. Revisa la sintaxis.', 'error');
        return;
      }
    }

    if (currentMode === 'supabase') {
      // Supabase mode
      const url = supaUrl.value.trim();
      const key = supaKey.value.trim();
      const fnSlug = supaFunction.value;

      if (!url || !key) {
        showToast('Conecta tu proyecto Supabase primero', 'error');
        return;
      }
      if (!fnSlug) {
        showToast('Selecciona una Edge Function', 'error');
        return;
      }

      target = {
        supabase: { url, key, functionSlug: fnSlug },
        payload: body
      };

    } else {
      // Manual mode
      const url = manualUrl.value.trim();
      const method = manualMethod.value;

      if (!url) {
        showToast('Ingresa la URL destino del webhook', 'error');
        return;
      }

      target = {
        url,
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body } : {})
      };
    }

    // Build schedule
    const schedType = document.querySelector('input[name="schedule-type"]:checked').value;
    let schedule = undefined;

    if (schedType === 'delay') {
      const secs = parseInt(scheduleDelay.value);
      if (secs && secs > 0) {
        schedule = { type: 'delay', delaySeconds: secs };
      }
    } else {
      const expr = scheduleCron.value.trim();
      if (expr) {
        schedule = { type: 'cron', expression: expr };
      }
    }

    // Build request body
    const requestBody = { name };

    if (currentMode === 'supabase') {
      requestBody.supabase = target.supabase;
      requestBody.payload = target.payload;
    } else {
      requestBody.target = target;
    }

    if (schedule) requestBody.schedule = schedule;

    // Send
    btnSubmit.classList.add('loading');
    btnSubmit.disabled = true;

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la tarea');
      }

      showToast(`Tarea "${name}" programada exitosamente (ID: ${data.jobId})`, 'success');
      
      // Reset some fields
      payload.value = '';
      jobName.value = '';
      scheduleDelay.value = '';
      scheduleCron.value = '';

      // Refresh stats, active tasks, and history immediately
      fetchStats();
      fetchLogs();
      fetchActiveJobs();

    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnSubmit.classList.remove('loading');
      btnSubmit.disabled = false;
    }
  }

  // ========== JSON Payload Validation (live) ==========
  payload.addEventListener('input', () => {
    const raw = payload.value.trim();
    if (!raw) {
      payload.style.borderColor = '';
      return;
    }
    try {
      JSON.parse(raw);
      payload.style.borderColor = 'var(--accent)';
    } catch {
      payload.style.borderColor = 'var(--danger)';
    }
  });

  // ========== Init ==========
  fetchStats();
  fetchLogs();
  fetchActiveJobs();
  setInterval(fetchStats, 5000);
  setInterval(fetchLogs, 5000);
  setInterval(fetchActiveJobs, 2000); // Polling de tareas vigentes más rápido (2 segundos)

})();
