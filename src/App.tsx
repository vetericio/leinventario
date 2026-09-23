import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import {
  Barcode,
  Camera,
  Upload,
  Copy,
  Plus,
  Trash2,
  FileSpreadsheet,
  Download,
  Package,
  Layers,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
  ExternalLink,
  Smartphone,
  Share2,
} from 'lucide-react'
import './App.css'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InventoryItem {
  id: string
  rawCode: string
  colA: string
  colB?: string
  colC?: string
  quantity: number
  timestamp: string
  dateRead?: string
  lote: string
  area: string
  user?: string
  onlineSequence?: number
}

function parseCode(raw: string) {
  const value = raw.trim()
  const loteStart = value.indexOf('00')
  if (loteStart < 0) {
    return { rawCode: raw, colA: '', colB: '' }
  }

  const lote = value.slice(loteStart, loteStart + 10)
  const material = value.slice(loteStart + 10, loteStart + 18)
  return { rawCode: raw, colA: lote, colB: material }
}

const SUPABASE_URL = 'https://mwrmfcyrdxfxssebgknz.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Y5qsG-0F69poaQjUnWxGKw_8WOydkZc'

async function createOnlineItem(item: InventoryItem) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/leinventario_registros?select=sequencial`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      usuario: item.user,
      area: item.area,
      codigo_material: item.colB,
      lote: item.lote,
    }),
  })
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json() as Array<{ sequencial: number }>
  return data[0]?.sequencial
}

async function fetchOnlineItems(): Promise<InventoryItem[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/leinventario_registros?select=sequencial,usuario,area,codigo_material,lote,bipado_em&order=sequencial.desc`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!response.ok) throw new Error(await response.text())
  const rows = await response.json() as Array<{ sequencial:number; usuario:string; area:string; codigo_material:string; lote:string; bipado_em:string }>
  return rows.map((row) => {
    const d = new Date(row.bipado_em)
    return { id: `online-${row.sequencial}`, rawCode: '', colA: row.lote, colB: row.codigo_material, quantity: 1, timestamp: d.toLocaleTimeString('pt-BR'), dateRead: d.toLocaleString('pt-BR'), lote: row.lote, area: row.area, user: row.usuario, onlineSequence: row.sequencial }
  })
}

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()

    // Bip forte e curto para confirmar cada leitura.
    osc.type = 'square'
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime)
    gain.gain.setValueAtTime(0.9, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.28)

    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.28)
  } catch {
    // O navegador pode bloquear áudio antes da primeira interação.
  }
}

function App() {
  const [mode, setMode] = useState<'camera' | 'file' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [baseOnline, setBaseOnline] = useState<boolean | null>(null)
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null)

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportUrl, setExportUrl] = useState<string | null>(null)
  const [exportFileName, setExportFileName] = useState('')
  const inIframe = typeof window !== 'undefined' && window.self !== window.top


  const [items, setItems] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('leinventario_items')
    if (!saved) return []
    const parsed = JSON.parse(saved)
    // Migrate old format
    return parsed.map((item: { id: string; code?: string; rawCode?: string; colA?: string; colB?: string; colC?: string; quantity: number; timestamp: string }) => ({
      id: item.id || Date.now().toString(),
      rawCode: item.rawCode || item.code || '',
      colA: item.colA || item.code || '',
      colB: item.colB,
      colC: item.colC,
      lote: (item as { lote?: string }).lote || '',
      area: (item as { area?: string }).area || '',
      user: (item as { user?: string }).user || '',
      onlineSequence: (item as { onlineSequence?: number }).onlineSequence,
      quantity: item.quantity || 1,
      timestamp: item.timestamp || '',
    }))
  })

  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [pendingScan, setPendingScan] = useState<{ code: string; parsed: ReturnType<typeof parseCode> } | null>(null)
  const [lote, setLote] = useState('')
  const [area, setArea] = useState('')
  const [selectedUser, setSelectedUser] = useState(() => localStorage.getItem('leinventario_user') || '')
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearConfirmInput, setClearConfirmInput] = useState('')

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showInstallHelp, setShowInstallHelp] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null)
  const lastScanTimeRef = useRef<number>(0)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
      }
      setDeferredPrompt(null)
    } else {
      setShowInstallHelp((prev) => !prev)
    }
  }

  useEffect(() => {
    localStorage.setItem('leinventario_items', JSON.stringify(items))
  }, [items])

  useEffect(() => {
    if (selectedUser) localStorage.setItem('leinventario_user', selectedUser)
  }, [selectedUser])

  const pullOnlineItems = async () => {
    const onlineItems = await fetchOnlineItems()
    setItems((prev) => [...onlineItems, ...prev.filter((item) => !item.onlineSequence)])
  }

  const checkBaseOnline = async () => {
    if (!navigator.onLine) {
      setBaseOnline(false)
      return false
    }
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/leinventario_registros?select=sequencial&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      })
      const ok = response.ok
      setBaseOnline(ok)
      return ok
    } catch {
      setBaseOnline(false)
      return false
    }
  }

  useEffect(() => {
    checkBaseOnline().then((ok) => { if (ok) pullOnlineItems().catch(console.error) })
    const handleOnline = () => { checkBaseOnline().then((ok) => { if (ok) pullOnlineItems().catch(console.error) }) }
    const handleOffline = () => setBaseOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    const timer = window.setInterval(checkBaseOnline, 30000)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.clearInterval(timer)
    }
  }, [])

  const forceSync = async () => {
    setSyncing(true)
    const pending = items.filter((item) => !item.onlineSequence)
    if (pending.length === 0) {
      try { await pullOnlineItems(); setBaseOnline(true); setSyncError(null) }
      catch { setBaseOnline(false); setSyncError('Sem conexão com a base online.') }
      setSyncing(false)
      return
    }
    try {
      const synced = new Map<string, number>()
      for (const item of [...pending].reverse()) {
        const sequence = await createOnlineItem(item)
        if (sequence) synced.set(item.id, sequence)
      }
      setItems((prev) => prev.map((item) => synced.has(item.id) ? { ...item, onlineSequence: synced.get(item.id) } : item))
      await pullOnlineItems()
      setSyncError(null)
      setBaseOnline(true)
    } catch (err) {
      console.error('Falha na sincronização manual:', err)
      setSyncError('Não foi possível enviar todos os registros. Toque em Atualizar base online novamente quando houver internet.')
      setBaseOnline(false)
    } finally {
      setSyncing(false)
    }
  }

  const handleBarcodeRead = (code: string) => {
    const now = Date.now()
    if (now - lastScanTimeRef.current < 1500) {
      return
    }
    lastScanTimeRef.current = now

    if (soundEnabled) {
      playBeep()
    }

    setLastScanned(code)
    setSaveErrors([])
    setSaveConfirmation(null)
    const parsed = parseCode(code)
    setPendingScan({ code, parsed })
    setLote(parsed.colA)
  }

  const saveScannedItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingScan) return

    const validationErrors: string[] = []
    if (!selectedUser) validationErrors.push('Selecione o usuário.')
    if (area.trim().length !== 4) validationErrors.push('Preencha a área com 4 caracteres.')
    if (lote.trim().length !== 10) validationErrors.push('Preencha o lote com 10 caracteres.')
    if (validationErrors.length > 0) {
      setSaveErrors(validationErrors)
      setSaveConfirmation(null)
      return
    }

    const { parsed } = pendingScan

    const nowObj = new Date()
    const dateStr = nowObj.toLocaleDateString('pt-BR')
    const timeStr = nowObj.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const fullDateTime = `${dateStr} ${timeStr}`

    const newItem: InventoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      rawCode: parsed.rawCode,
      colA: lote.trim(),
      colB: parsed.colB,
      quantity: 1,
      timestamp: timeStr,
      dateRead: fullDateTime,
      lote: lote.trim(),
      area: area.trim(),
      user: selectedUser,
    }

    setItems((prev) => [newItem, ...prev])
    setPendingScan(null)
    setLote('')
    setLastScanned(null)
    setSaveErrors([])
    setSaveConfirmation('Código salvo no aparelho.')
    window.setTimeout(() => setSaveConfirmation(null), 3000)

    void createOnlineItem(newItem)
      .then((onlineSequence) => {
        setItems((prev) => prev.map((item) => item.id === newItem.id ? { ...item, onlineSequence } : item))
        setSyncError(null)
        setBaseOnline(true)
      })
      .catch((err) => {
        console.error('Falha ao sincronizar registro:', err)
        setSyncError('Registro salvo no aparelho, mas ainda não foi enviado para a base online.')
        setBaseOnline(false)
      })
  }

  const startCamera = async () => {
    setCameraError(null)

    try {
      if (html5QrcodeRef.current) {
        try {
          await html5QrcodeRef.current.stop()
        } catch {
          // ignore stop error
        }
      }

      const qrCode = new Html5Qrcode('barcode-scanner')
      html5QrcodeRef.current = qrCode

      const config = {
        fps: 10,
        qrbox: { width: 280, height: 160 },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
      }

      try {
        await qrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => handleBarcodeRead(decodedText),
          () => {}
        )
      } catch {
        // Fallback to default/user facing camera
        await qrCode.start(
          { facingMode: 'user' },
          config,
          (decodedText) => handleBarcodeRead(decodedText),
          () => {}
        )
      }
    } catch (err: unknown) {
      console.error('Camera access error:', err)
      setCameraError(
        'Não foi possível acessar a câmera. Clique no botão abaixo para permitir o acesso ou tente em outro navegador.'
      )
    }
  }

  const stopCamera = async () => {
    if (html5QrcodeRef.current) {
      try {
        await html5QrcodeRef.current.stop()
      } catch {
        // ignore
      }
      html5QrcodeRef.current = null
    }
  }

  useEffect(() => {
    if (mode === 'camera') {
      const timer = setTimeout(() => {
        startCamera()
      }, 100)
      return () => {
        clearTimeout(timer)
        stopCamera()
      }
    } else {
      stopCamera()
    }
  }, [mode])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const html5Qrcode = new Html5Qrcode('file-scanner-temp')
    try {
      const decodedText = await html5Qrcode.scanFile(file, true)
      handleBarcodeRead(decodedText)
    } catch (err) {
      alert('Não foi possível ler nenhum código de barras na imagem.')
      console.error(err)
    }
  }

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualCode.trim()) return
    handleBarcodeRead(manualCode.trim())
    setManualCode('')
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const clearAll = () => {
    setShowClearModal(true)
    setClearConfirmInput('')
  }

  const exportXLSX = async () => {
    if (items.length === 0) return
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs/dist/exceljs.min.js')).default
      const now = new Date()
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Leinventário'
      const ws = wb.addWorksheet('Inventário')

      ws.columns = [
        { header: 'Sequencial', key: 'sequencial', width: 12 },
        { header: 'Usuário', key: 'usuario', width: 16 },
        { header: 'Área', key: 'area', width: 12 },
        { header: 'Código Material', key: 'material', width: 20 },
        { header: 'Lote', key: 'lote', width: 18 },
        { header: 'Data e horário bipado', key: 'dataHora', width: 24 },
      ]

      const chronologicalItems = [...items].reverse()
      chronologicalItems.forEach((item, index) => {
        ws.addRow({
          sequencial: item.onlineSequence ?? index + 1,
          usuario: item.user || '',
          area: item.area || '',
          material: item.colB || '',
          lote: item.lote || '',
          dataHora: item.dateRead || item.timestamp || '',
        })
      })

      const headerRow = ws.getRow(1)
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      ws.views = [{ state: 'frozen', ySplit: 1 }]

      const out = await wb.xlsx.writeBuffer()
      const blob = new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const fileName = `leinventario_${now.toISOString().slice(0, 10)}.xlsx`
      setExportError(null)
      setExportUrl(url)
      setExportFileName(fileName)

      const link = document.createElement('a')
      link.href = url
      link.rel = 'noopener'
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      if (inIframe) window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000)
    } catch (err) {
      console.error(err)
      setExportUrl(null)
      setExportError('Não foi possível gerar a planilha. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }


  const copyTable = () => {
    if (items.length === 0) return
    const text = [...items].reverse()
      .map((item, idx) => `${idx + 1}\t${item.user || ''}\t${item.area}\t${item.colB || ''}\t${item.lote}\t${item.dateRead || item.timestamp}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }


  const totalCodes = items.length
  const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0)



  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-container">
          <img src="./icon-512.png?v=2" alt="Leinventário Logo" className="app-logo" />
          <div>
            <h1>Leinventário</h1>
            <p>Leitor de Códigos de Barras e Gerenciador de Inventário</p>
          </div>
        </div>
      </header>

      <div className="config-trigger-card" style={{ border: baseOnline ? '2px solid #16a34a' : '2px solid #dc2626' }}>
        <div className="config-trigger-info">
          <div>
            <strong>{baseOnline === true ? '🟢 ONLINE — enviando para a base' : baseOnline === false ? '🔴 OFFLINE — registros ficam no aparelho' : '🟡 Verificando base online...'}</strong>
            <p>{items.filter((item) => !item.onlineSequence).length === 0 ? 'Todos os registros deste aparelho estão sincronizados.' : `${items.filter((item) => !item.onlineSequence).length} registro(s) aguardando envio.`}</p>
          </div>
        </div>
      </div>

      {/* Stats Header */}
      <div className="stats-bar">
        <div className="stat-card">
          <Layers className="stat-icon" />
          <div>
            <div className="stat-value">{totalCodes.toLocaleString('pt-BR')}</div>
            <div className="stat-label">Códigos Únicos</div>
          </div>
        </div>
        <div className="stat-card accent">
          <Package className="stat-icon" />
          <div>
            <div className="stat-value">{totalQuantity.toLocaleString('pt-BR')}</div>
            <div className="stat-label">Quantidade Total</div>
          </div>
        </div>
      </div>

      {/* Mode Controls */}
      <div className="controls-bar">
        <div className="mode-tabs">
          <button
            className={`tab-btn ${mode === 'camera' ? 'active' : ''}`}
            onClick={() => setMode('camera')}
          >
            <Camera size={18} /> Câmera
          </button>
          <button
            className={`tab-btn ${mode === 'file' ? 'active' : ''}`}
            onClick={() => setMode('file')}
          >
            <Upload size={18} /> Imagem
          </button>
          <button
            className={`tab-btn ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            <Plus size={18} /> Manual
          </button>
        </div>

        <button
          className="sound-btn"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Som ativado' : 'Som desativado'}
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      </div>

      <div className="config-trigger-card">
        <div className="config-trigger-info">
          <div>
            <strong>Usuário</strong>
            <p>Selecione quem está realizando o inventário.</p>
          </div>
        </div>
        <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} aria-label="Usuário">
          <option value="">Selecionar</option>
          <option value="Vinícius">Vinícius</option>
          <option value="Ronie">Ronie</option>
          <option value="Ednaldo">Ednaldo</option>
        </select>
      </div>

      {/* Área manual */}
      <div className="config-trigger-card">
        <div className="config-trigger-info">
          <div>
            <strong>Área</strong>
            <p>Informe os 4 caracteres da área antes de bipar.</p>
          </div>
        </div>
        <input
          value={area}
          maxLength={4}
          onChange={(e) => setArea(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4))}
          placeholder="Área"
          aria-label="Área de 4 caracteres"
        />
      </div>



      {/* Reader / Input Box */}
      <div className="scanner-card">
        {mode === 'camera' && (
          <div>
            <div id="barcode-scanner"></div>
            {cameraError && (
              <div className="camera-error-box">
                <p>{cameraError}</p>
                <button className="btn btn-primary" onClick={startCamera}>
                  <Camera size={18} /> Ligar Câmera
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'file' && (
          <div>
            <div
              className="upload-box"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="upload-icon" />
              <p><strong>Clique para enviar a foto do Código de Barras</strong></p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                Formatos: EAN-13, EAN-8, CODE-128, QR Code...
              </p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden-input"
              onChange={handleFileUpload}
            />
            <div id="file-scanner-temp" style={{ display: 'none' }}></div>
          </div>
        )}

        {mode === 'manual' && (
          <form className="manual-form" onSubmit={handleManualAdd}>
            <input
              type="text"
              className="manual-input"
              placeholder="Digite o código de barras..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn btn-primary btn-add-manual">
              <Plus size={18} /> Adicionar
            </button>
          </form>
        )}

        {lastScanned && (
          <div className="last-scanned-badge">
            Último código lido: <strong>{lastScanned}</strong>
          </div>
        )}
        {pendingScan && (
          <form className="scan-details-form" onSubmit={saveScannedItem}>
            <label className={saveErrors.some((message) => message.includes('lote')) ? 'field-error' : ''}>Lote
              <input
                value={lote}
                maxLength={10}
                required
                aria-invalid={saveErrors.some((message) => message.includes('lote'))}
                onChange={(e) => {
                  setLote(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10))
                  setSaveErrors([])
                }}
                placeholder="10 caracteres"
              />
            </label>
            <label>Código do material
              <input value={pendingScan.parsed.colB || ''} readOnly />
            </label>
            <label className={saveErrors.some((message) => message.includes('área')) ? 'field-error' : ''}>Área
              <input value={area} readOnly aria-invalid={saveErrors.some((message) => message.includes('área'))} />
            </label>
            <button type="submit" className="btn btn-primary">
              <Check size={18} /> Salvar
            </button>
            {saveErrors.length > 0 && (
              <div className="save-feedback error" role="alert">
                <strong>Antes de salvar:</strong>
                <ul>{saveErrors.map((message) => <li key={message}>{message}</li>)}</ul>
              </div>
            )}
          </form>
        )}
        {saveConfirmation && <div className="save-feedback success" role="status"><Check size={18} /> {saveConfirmation}</div>}
      </div>

      {syncError && <div className="export-note error">{syncError}</div>}

      {/* Planilha / Tabela Numerada */}
      <section className="inventory-section">
        <div className="inventory-header">
          <div>
            <h2><FileSpreadsheet size={22} /> Inventário registrado</h2>
            <p className="inventory-subtitle">Confira os dados abaixo antes de exportar para o Excel.</p>
          </div>
          {items.length > 0 && (
            <div className="inventory-actions">
              <button className="btn" onClick={copyTable} title="Copiar lista">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              <button className="btn btn-primary" onClick={exportXLSX} disabled={exporting} title="Baixar Excel">
                <Download size={16} /> {exporting ? 'Gerando...' : 'Exportar Excel'}

              </button>
              <button className="btn btn-danger" onClick={clearAll} title="Limpar tudo">
                <RotateCcw size={16} /> Limpar
              </button>
            </div>
          )}
        </div>

        {exportUrl && (
          <div className="export-note">
            Planilha gerada. Se o download não começou,{' '}
            <a href={exportUrl} download={exportFileName}>
              toque aqui para baixar
            </a>
            .
          </div>
        )}

        {exportError && <div className="export-note error">{exportError}</div>}

        {items.length === 0 ? (
          <div className="empty-state">
            <Barcode size={48} opacity={0.3} />
            <p>Nenhum código lido até o momento.</p>
            <span>Aponta a câmera para os códigos de barras para preencher a planilha.</span>
          </div>
        ) : (
          <>
            <div className="inventory-summary">
              <div><span>Total de registros</span><strong>{items.length}</strong></div>
              <div><span>Itens contabilizados</span><strong>{items.reduce((sum, item) => sum + item.quantity, 0)}</strong></div>
              <div><span>Último lote</span><strong>{items[0]?.lote || '-'}</strong></div>
            </div>
            <div className="table-responsive">
              <table className="inventory-table">
              <thead>
                <tr>
                  <th>Sequencial</th>
                  <th>Usuário</th>
                  <th>Área</th>
                  <th>Código Material</th>
                  <th>Lote</th>
                  <th>Data e horário bipado</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {[...items].reverse().map((item, index) => (
                  <tr key={item.id}>
                    <td className="row-num">{item.onlineSequence ?? index + 1}</td>
                    <td>{item.user || '-'}</td>
                    <td><span className="data-badge area-badge">{item.area || '-'}</span></td>
                    <td className="code-cell material-cell">{item.colB || '-'}</td>
                    <td><span className="data-badge lot-badge">{item.lote || '-'}</span></td>
                    <td className="time-cell">{item.dateRead || item.timestamp}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="icon-btn danger" onClick={() => removeItem(item.id)} title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>            </table>
            </div>
          </>
        )}
      </section>

      <div className="config-trigger-card">
        <div className="config-trigger-info">
          <div>
            <strong>Base online</strong>
            <p>Envia os pendentes e busca os registros feitos nos outros aparelhos.</p>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={forceSync} disabled={syncing}>
          <RotateCcw size={18} /> {syncing ? 'Sincronizando...' : 'Sincronizar todos os aparelhos'}
        </button>
      </div>

      {/* Opção Instalar o App no final */}
      {!isInstalled && (
        <footer className="app-footer">
          <div className="install-card">
            <div className="install-info">
              <div className="install-icon-wrapper">
                <Smartphone size={24} className="install-icon" />
              </div>
              <div>
                <h3>Instalar o Leinventário</h3>
                <p>Instale na tela inicial para usar offline, sem internet e com acesso rápido.</p>
              </div>
            </div>
            {inIframe ? (
              <a
                className="btn btn-install"
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={18} /> Abrir em nova aba
              </a>
            ) : (
              <button type="button" className="btn btn-install" onClick={handleInstallClick}>
                <Smartphone size={18} /> Instalar App
              </button>
            )}
          </div>

          {inIframe && (
            <div className="install-help-box">
              Você está vendo o app dentro de uma janela embutida. Aqui o celular não deixa
              instalar nem baixar arquivos. Toque em <strong>"Abrir em nova aba"</strong> e
              faça a instalação por lá.
            </div>
          )}

          {(showInstallHelp || inIframe) && (
            <div className="install-help-box">
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 700, color: 'var(--text-h)' }}>
                Como instalar manualmente:
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <li>
                  <strong>No Android / Chrome:</strong> Toque nos 3 pontos (⋮) no canto superior do navegador e selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                </li>
                <li>
                  <strong>No iPhone / Safari:</strong> Toque no ícone de <strong>Compartilhar</strong> (<Share2 size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />) e selecione <strong>"Adicionar à Tela de Início"</strong>.
                </li>
              </ul>
            </div>
          )}
        </footer>
      )}

      <div className="footer-credits">
        Feito por Veterício Tech - 31995512795
      </div>


      {/* Modal Confirmar Limpeza */}
      {showClearModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>
              <Trash2 size={22} color="#dc2626" /> Apagar Planilha
            </h3>
            <p style={{ margin: 0, color: 'var(--text-h)', fontWeight: 500 }}>
              Esta ação irá <strong>apagar permanentemente</strong> todos os itens registrados.
            </p>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}>
              Para confirmar e evitar perda acidental de dados, digite <strong>APAGAR</strong> no campo abaixo:
            </p>
            <input
              type="text"
              className="modal-input"
              placeholder="Digite APAGAR"
              value={clearConfirmInput}
              onChange={(e) => setClearConfirmInput(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowClearModal(false)
                  setClearConfirmInput('')
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={clearConfirmInput.trim().toUpperCase() !== 'APAGAR'}
                onClick={() => {
                  if (clearConfirmInput.trim().toUpperCase() === 'APAGAR') {
                    setItems([])
                    setLastScanned(null)
                    localStorage.removeItem('leinventario_items')
                    setShowClearModal(false)
                    setClearConfirmInput('')
                  }
                }}
              >
                Apagar Planilha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
