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
  SlidersHorizontal,
  X,
  ExternalLink,
  Smartphone,
  Share2,
} from 'lucide-react'
import './App.css'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const EXAMPLE_CODE = '(99)002146769234018047<>'

interface SplitRule {
  splitMode: '1' | '2' | '3'
  cleanSymbols: boolean
  col1Length: number
  col2Length: number
  col3Length: number
  ignoreStart?: number
  ignoreEnd?: number
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
}

function parseCode(raw: string, rule: SplitRule) {
  let cleaned = raw.trim()
  if (rule.cleanSymbols) {
    cleaned = cleaned.replace(/[()<>\s]/g, '')
  }

  const ignoreStart = Math.max(0, rule.ignoreStart || 0)
  const ignoreEnd = Math.max(0, rule.ignoreEnd || 0)
  if (ignoreStart || ignoreEnd) {
    const end = cleaned.length - ignoreEnd
    cleaned = end > ignoreStart ? cleaned.slice(ignoreStart, end) : ''
  }


  if (rule.splitMode === '1') {
    return { rawCode: raw, colA: cleaned }
  }

  if (rule.splitMode === '2') {
    const lenB = Math.max(1, rule.col2Length)
    if (cleaned.length <= lenB) {
      return { rawCode: raw, colA: '', colB: cleaned }
    }
    const colB = cleaned.slice(-lenB)
    const rest = cleaned.slice(0, cleaned.length - lenB)

    let colA = rest
    if (rule.col1Length > 0 && rest.length > rule.col1Length) {
      colA = rest.slice(-rule.col1Length)
    }

    return { rawCode: raw, colA, colB }
  }

  if (rule.splitMode === '3') {
    const lenC = Math.max(1, rule.col3Length)
    const lenB = Math.max(1, rule.col2Length)

    if (cleaned.length <= lenC) {
      return { rawCode: raw, colA: '', colB: '', colC: cleaned }
    }
    const colC = cleaned.slice(-lenC)
    const restC = cleaned.slice(0, cleaned.length - lenC)

    if (restC.length <= lenB) {
      return { rawCode: raw, colA: '', colB: restC, colC }
    }
    const colB = restC.slice(-lenB)
    const restB = restC.slice(0, restC.length - lenB)

    let colA = restB
    if (rule.col1Length > 0 && restB.length > rule.col1Length) {
      colA = restB.slice(-rule.col1Length)
    }

    return { rawCode: raw, colA, colB, colC }
  }

  return { rawCode: raw, colA: cleaned }
}

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, audioCtx.currentTime)
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.15)
  } catch {
    // ignore audio
  }
}

function App() {
  const [mode, setMode] = useState<'camera' | 'file' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [draftRule, setDraftRule] = useState<SplitRule | null>(null)
  const [configSaved, setConfigSaved] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportUrl, setExportUrl] = useState<string | null>(null)
  const [exportFileName, setExportFileName] = useState('')
  const inIframe = typeof window !== 'undefined' && window.self !== window.top

  const [splitRule, setSplitRule] = useState<SplitRule>(() => {
    const saved = localStorage.getItem('leinventario_split_rule')
    const base = {
      splitMode: '2' as const,
      cleanSymbols: true,
      col1Length: 10,
      col2Length: 8,
      col3Length: 8,
      ignoreStart: 0,
      ignoreEnd: 0,
    }
    return saved ? { ...base, ...JSON.parse(saved) } : base
  })


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
      quantity: item.quantity || 1,
      timestamp: item.timestamp || '',
    }))
  })

  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [pendingScan, setPendingScan] = useState<{ code: string; parsed: ReturnType<typeof parseCode> } | null>(null)
  const [lote, setLote] = useState('')
  const [area, setArea] = useState('')
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
    localStorage.setItem('leinventario_split_rule', JSON.stringify(splitRule))
  }, [splitRule])

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
    setPendingScan({ code, parsed: parseCode(code, splitRule) })
    setLote('')
    setArea('')
  }

  const saveScannedItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingScan || !lote.trim() || !area.trim()) return
    const { parsed } = pendingScan

    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.rawCode === parsed.rawCode ||
          (item.colA === parsed.colA && item.lote === lote.trim() && item.area === area.trim() &&
            (item.colB || '') === (parsed.colB || '') &&
            (item.colC || '') === (parsed.colC || ''))
      )
      const nowObj = new Date()
      const dateStr = nowObj.toLocaleDateString('pt-BR')
      const timeStr = nowObj.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      const fullDateTime = `${dateStr} ${timeStr}`

      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
          timestamp: timeStr,
          dateRead: fullDateTime,
          lote: lote.trim(),
          area: area.trim(),
        }
        return updated
      } else {
        const newItem: InventoryItem = {
          id: Date.now().toString(),
          rawCode: parsed.rawCode,
          colA: parsed.colA,
          colB: parsed.colB,
          colC: parsed.colC,
          quantity: 1,
          timestamp: timeStr,
          dateRead: fullDateTime,
          lote: lote.trim(),
          area: area.trim(),
        }
        return [newItem, ...prev]
      }
    })
    setPendingScan(null)
    setLote('')
    setArea('')
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

  const updateQuantity = (id: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta
            return newQty > 0 ? { ...item, quantity: newQty } : null
          }
          return item
        })
        .filter(Boolean) as InventoryItem[]
    )
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
      const exportDateStr = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`

      const wb = new ExcelJS.Workbook()
      wb.creator = 'Leinventário'
      const ws = wb.addWorksheet('Inventário')

      ws.columns = [
        { key: 'area', width: 14 },
        { key: 'material', width: 22 },
        { key: 'lote', width: 14 },
      ]

      // Logo no topo
      try {
        const res = await fetch('./icon-192.png')
        const buf = await res.arrayBuffer()
        const imgId = wb.addImage({ buffer: buf, extension: 'png' })
        ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 90, height: 90 } })
      } catch {
        // segue sem logo se a imagem não carregar
      }
      ws.getRow(1).height = 70

      ws.mergeCells('B1:C1')
      const title = ws.getCell('B1')
      title.value = 'Leinventário'
      title.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF00A344' } }
      title.alignment = { vertical: 'middle' }

      ws.mergeCells('B2:C2')
      const sub = ws.getCell('B2')
      sub.value = `Data e hora da exportação: ${exportDateStr}`
      sub.font = { name: 'Arial', size: 10, color: { argb: 'FF555555' } }

      const headerRow = ws.addRow([
        'Área', 'Código Material', 'Lote',
      ])
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00A344' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } }
      })

      items.forEach((item) => {
        const row = ws.addRow([
          item.area, item.colA || item.rawCode || '', item.lote,
        ])
        row.eachCell((cell) => {
          cell.font = { name: 'Arial', size: 11 }
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E5E5' } } }
        })
        row.getCell(2).alignment = { horizontal: 'center' }
      })

      ws.views = [{ state: 'frozen', ySplit: headerRow.number }]

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

      // Dentro do preview do editor (janela embutida) o download é bloqueado:
      // abre em uma nova aba como alternativa.
      if (inIframe) {
        window.open(url, '_blank')
      }

      // Mantém o link válido por alguns minutos para o botão manual funcionar.
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000)
    } catch (err) {
      console.error(err)
      setExportUrl(null)
      setExportError(
        'Não foi possível gerar a planilha. Tente abrir o app direto no navegador (Chrome ou Safari) e exportar de novo.'
      )
    } finally {
      setExporting(false)
    }
  }


  const copyTable = () => {
    if (items.length === 0) return
    const text = items
      .map((item, idx) => {
        let cols = `${idx + 1}.\t${item.rawCode}\t${item.colA}`
        if (item.colB) cols += `\t${item.colB}`
        if (item.colC) cols += `\t${item.colC}`
        cols += `\tQtd: ${item.quantity}\t(${item.timestamp})`
        return cols
      })
      .join('\n')

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const totalCodes = items.length
  const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0)

  const cfg = draftRule ?? splitRule
  const previewSample = lastScanned || EXAMPLE_CODE
  const previewParsed = parseCode(previewSample, cfg)

  const openConfig = () => {
    setDraftRule({ ...splitRule })
    setConfigOpen(true)
  }

  const updateDraft = (patch: Partial<SplitRule>) => {
    setDraftRule((r) => ({ ...(r ?? splitRule), ...patch }))
  }

  const saveConfig = () => {
    if (draftRule) setSplitRule(draftRule)
    setConfigOpen(false)
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2500)
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-container">
          <img src="./logo.png" alt="Leinventário Logo" className="app-logo" />
          <div>
            <h1>Leinventário</h1>
            <p>Leitor de Códigos de Barras e Gerenciador de Inventário</p>
          </div>
        </div>
      </header>

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

      {/* Configuração das colunas (janela separada) */}
      <div className="config-trigger-card">
        <div className="config-trigger-info">
          <SlidersHorizontal size={20} className="config-icon" />
          <div>
            <strong>Configurar colunas</strong>
            <p>
              {splitRule.splitMode === '1'
                ? 'Hoje: o código vai inteiro para 1 coluna'
                : `Hoje: o código é dividido em ${splitRule.splitMode} partes`}
            </p>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={openConfig}>
          Abrir
        </button>
      </div>

      {configSaved && <div className="config-saved-toast">Configuração salva</div>}

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
            <label>Lote
              <input value={lote} maxLength={10} required onChange={(e) => setLote(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))} placeholder="Até 10 caracteres" />
            </label>
            <label>Área
              <input value={area} maxLength={4} required onChange={(e) => setArea(e.target.value.slice(0, 4))} placeholder="4 caracteres" />
            </label>
            <button type="submit" className="btn btn-primary"><Check size={18} /> Gravar</button>
          </form>
        )}
      </div>

      {/* Planilha / Tabela Numerada */}
      <section className="inventory-section">
        <div className="inventory-header">
          <h2>
            <FileSpreadsheet size={22} /> Planilha do Inventário
          </h2>
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
          <div className="table-responsive">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>#</th>
                  <th>Código Lido</th>
                  <th>Coluna A</th>
                  {splitRule.splitMode !== '1' && <th>Coluna B</th>}
                  {splitRule.splitMode === '3' && <th>Coluna C</th>}
                  <th style={{ width: '120px', textAlign: 'center' }}>Quantidade</th>
                  <th style={{ width: '100px' }}>Hora</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="row-num">{index + 1}</td>
                    <td className="code-cell raw">{item.rawCode}</td>
                    <td className="code-cell col-cell">{item.colA || '-'}</td>
                    {splitRule.splitMode !== '1' && (
                      <td className="code-cell col-cell">{item.colB || '-'}</td>
                    )}
                    {splitRule.splitMode === '3' && (
                      <td className="code-cell col-cell">{item.colC || '-'}</td>
                    )}
                    <td>
                      <div className="qty-controls">
                        <button
                          className="qty-btn"
                          onClick={() => updateQuantity(item.id, -1)}
                        >
                          -
                        </button>
                        <span className="qty-value">{item.quantity}</span>
                        <button
                          className="qty-btn"
                          onClick={() => updateQuantity(item.id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="time-cell">{item.timestamp}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="icon-btn danger"
                        onClick={() => removeItem(item.id)}
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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


      {/* Janela de Configuração das Colunas */}
      {configOpen && cfg && (
        <div className="modal-overlay" onClick={() => setConfigOpen(false)}>
          <div className="modal-card config-modal" onClick={(e) => e.stopPropagation()}>
            <div className="config-modal-head">
              <h3 className="config-modal-title">
                <SlidersHorizontal size={20} className="config-icon" /> Configurar colunas
              </h3>
              <button type="button" className="icon-btn" onClick={() => setConfigOpen(false)} title="Fechar">
                <X size={20} />
              </button>
            </div>

            <div className="config-modal-body">
              <div className="config-step">
                <div className="config-step-title">1. Em quantas partes quer dividir o código?</div>
                <div className="split-mode-tabs">
                  <button
                    type="button"
                    className={`split-btn ${cfg.splitMode === '1' ? 'active' : ''}`}
                    onClick={() => updateDraft({ splitMode: '1' })}
                  >
                    1 parte
                  </button>
                  <button
                    type="button"
                    className={`split-btn ${cfg.splitMode === '2' ? 'active' : ''}`}
                    onClick={() => updateDraft({ splitMode: '2' })}
                  >
                    2 partes
                  </button>
                  <button
                    type="button"
                    className={`split-btn ${cfg.splitMode === '3' ? 'active' : ''}`}
                    onClick={() => updateDraft({ splitMode: '3' })}
                  >
                    3 partes
                  </button>
                </div>
                <div className="example-box">
                  <span className="example-label">Exemplo</span>
                  {cfg.splitMode === '1' && (
                    <p>
                      O código <code>{EXAMPLE_CODE}</code> vai inteiro para a <strong>Coluna A</strong>.
                    </p>
                  )}
                  {cfg.splitMode === '2' && (
                    <p>
                      O código é contado <strong>de trás para frente</strong>: os últimos caracteres
                      viram a <strong>Coluna B</strong> e o que sobra na frente vira a{' '}
                      <strong>Coluna A</strong>.
                    </p>
                  )}
                  {cfg.splitMode === '3' && (
                    <p>
                      Contando <strong>de trás para frente</strong>: os últimos caracteres viram a{' '}
                      <strong>Coluna C</strong>, os anteriores a <strong>Coluna B</strong> e o resto a{' '}
                      <strong>Coluna A</strong>.
                    </p>
                  )}
                </div>
              </div>

              {cfg.splitMode !== '1' && (
                <div className="config-step">
                  <div className="config-step-title">2. Quantos caracteres tem cada parte?</div>
                  <div className="config-inputs-grid">
                    {cfg.splitMode === '3' && (
                      <div className="config-input-item">
                        <label>Coluna C (últimos caracteres)</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={cfg.col3Length}
                          onChange={(e) => updateDraft({ col3Length: parseInt(e.target.value) || 1 })}
                        />
                        <span className="input-help">Ex.: 2 → pega os 2 últimos</span>
                      </div>
                    )}
                    <div className="config-input-item">
                      <label>
                        {cfg.splitMode === '3' ? 'Coluna B (antes da C)' : 'Coluna B (últimos caracteres)'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={cfg.col2Length}
                        onChange={(e) => updateDraft({ col2Length: parseInt(e.target.value) || 1 })}
                      />
                      <span className="input-help">Ex.: 4 → pega 4 caracteres</span>
                    </div>
                    <div className="config-input-item">
                      <label>Coluna A (o que sobra na frente)</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={cfg.col1Length}
                        onChange={(e) => updateDraft({ col1Length: parseInt(e.target.value) || 0 })}
                      />
                      <span className="input-help">0 = pega tudo o que sobrou</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="config-step">
                <div className="config-step-title">
                  {cfg.splitMode === '1' ? '2' : '3'}. Quer ignorar caracteres?
                </div>
                <div className="config-inputs-grid">
                  <div className="config-input-item">
                    <label>Ignorar do início</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={cfg.ignoreStart ?? 0}
                      onChange={(e) =>
                        updateDraft({ ignoreStart: Math.max(0, parseInt(e.target.value) || 0) })
                      }
                    />
                    <span className="input-help">0 = não ignora nada</span>
                  </div>
                  <div className="config-input-item">
                    <label>Ignorar do fim</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={cfg.ignoreEnd ?? 0}
                      onChange={(e) =>
                        updateDraft({ ignoreEnd: Math.max(0, parseInt(e.target.value) || 0) })
                      }
                    />
                    <span className="input-help">0 = não ignora nada</span>
                  </div>
                </div>
                <div className="example-box">
                  <span className="example-label">Exemplo</span>
                  <p>
                    Ignorando 2 do início em <code>AB123456</code> sobra <code>123456</code>.
                    Ignorando 2 do fim sobra <code>AB1234</code>.
                  </p>
                </div>
              </div>

              <div className="config-step">
                <div className="config-step-title">
                  {cfg.splitMode === '1' ? '3' : '4'}. Limpeza do código
                </div>
                <div className="config-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={cfg.cleanSymbols}
                      onChange={(e) => updateDraft({ cleanSymbols: e.target.checked })}
                    />
                    Apagar símbolos e espaços (ex: <code>()</code> <code>&lt;&gt;</code>)
                  </label>
                </div>
                <div className="example-box">
                  <span className="example-label">Exemplo</span>
                  <p>
                    <code>(99)0021 4676</code> vira <code>990021 4676</code>{' '}
                    {cfg.cleanSymbols ? '(ativado)' : '(desativado)'}
                  </p>
                </div>
              </div>

              <div className="preview-box">
                <div className="preview-title">Como vai ficar</div>
                <div className="preview-raw">
                  Código: <code>{previewSample}</code>
                </div>
                <div className="preview-cols">
                  <span className="preview-pill col-a">
                    Coluna A: <strong>{previewParsed.colA || '(vazio)'}</strong>
                  </span>
                  {cfg.splitMode !== '1' && (
                    <span className="preview-pill col-b">
                      Coluna B: <strong>{previewParsed.colB || '(vazio)'}</strong>
                    </span>
                  )}
                  {cfg.splitMode === '3' && (
                    <span className="preview-pill col-c">
                      Coluna C: <strong>{previewParsed.colC || '(vazio)'}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setConfigOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={saveConfig}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

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
