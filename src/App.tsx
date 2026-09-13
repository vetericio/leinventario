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
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import './App.css'

interface SplitRule {
  splitMode: '1' | '2' | '3'
  cleanSymbols: boolean
  col1Length: number
  col2Length: number
  col3Length: number
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
}

function parseCode(raw: string, rule: SplitRule) {
  let cleaned = raw.trim()
  if (rule.cleanSymbols) {
    cleaned = cleaned.replace(/[()<>\s]/g, '')
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
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(true)

  const [splitRule, setSplitRule] = useState<SplitRule>(() => {
    const saved = localStorage.getItem('leinventario_split_rule')
    return saved
      ? JSON.parse(saved)
      : {
          splitMode: '2',
          cleanSymbols: true,
          col1Length: 10,
          col2Length: 8,
          col3Length: 8,
        }
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
      quantity: item.quantity || 1,
      timestamp: item.timestamp || '',
    }))
  })

  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearConfirmInput, setClearConfirmInput] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null)
  const lastScanTimeRef = useRef<number>(0)

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

    const parsed = parseCode(code, splitRule)
    setLastScanned(code)

    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.rawCode === parsed.rawCode ||
          (item.colA === parsed.colA &&
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
        }
        return [newItem, ...prev]
      }
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

  const exportCSV = () => {
    if (items.length === 0) return

    const now = new Date()
    const exportDateStr = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`

    let csvText = '\uFEFF' // UTF-8 BOM for Microsoft Excel compatibility
    csvText += 'Leinventário\n'
    csvText += `Data e hora da exportação: ${exportDateStr}\n\n`
    csvText += 'Data da leitura;Quantidade;Código Completo;Coluna A;Coluna B;Coluna C\n'

    items.forEach((item) => {
      const raw = `"${(item.rawCode || '').replace(/"/g, '""')}"`
      const colA = `"${(item.colA || '').replace(/"/g, '""')}"`
      const colB = `"${(item.colB || '').replace(/"/g, '""')}"`
      const colC = `"${(item.colC || '').replace(/"/g, '""')}"`
      const dateRead = `"${item.dateRead || `${new Date().toLocaleDateString('pt-BR')} ${item.timestamp}`}"`
      const qty = item.quantity

      csvText += `${dateRead};${qty};${raw};${colA};${colB};${colC}\n`
    })

    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `leinventario_${now.toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
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
            <div className="stat-value">{totalCodes}</div>
            <div className="stat-label">Códigos Únicos</div>
          </div>
        </div>
        <div className="stat-card accent">
          <Package className="stat-icon" />
          <div>
            <div className="stat-value">{totalQuantity}</div>
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

      {/* Configurações de Divisão de Colunas */}
      <div className="config-card">
        <div
          className="config-card-header"
          onClick={() => setShowConfig(!showConfig)}
        >
          <div className="config-card-title">
            <SlidersHorizontal size={20} className="config-icon" />
            <span>Configuração de Divisão de Colunas</span>
          </div>
          <button className="icon-btn">
            {showConfig ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {showConfig && (
          <div className="config-card-body">
            <div className="config-group">
              <label className="config-label">Modo de Divisão:</label>
              <div className="split-mode-tabs">
                <button
                  type="button"
                  className={`split-btn ${splitRule.splitMode === '1' ? 'active' : ''}`}
                  onClick={() =>
                    setSplitRule((r) => ({ ...r, splitMode: '1' }))
                  }
                >
                  1 Coluna
                </button>
                <button
                  type="button"
                  className={`split-btn ${splitRule.splitMode === '2' ? 'active' : ''}`}
                  onClick={() =>
                    setSplitRule((r) => ({ ...r, splitMode: '2' }))
                  }
                >
                  2 Colunas (Final → Início)
                </button>
                <button
                  type="button"
                  className={`split-btn ${splitRule.splitMode === '3' ? 'active' : ''}`}
                  onClick={() =>
                    setSplitRule((r) => ({ ...r, splitMode: '3' }))
                  }
                >
                  3 Colunas (Final → Início)
                </button>
              </div>
            </div>

            {splitRule.splitMode !== '1' && (
              <div className="config-inputs-grid">
                {splitRule.splitMode === '2' && (
                  <>
                    <div className="config-input-item">
                      <label>Coluna B (Caracteres do final):</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={splitRule.col2Length}
                        onChange={(e) =>
                          setSplitRule((r) => ({
                            ...r,
                            col2Length: parseInt(e.target.value) || 1,
                          }))
                        }
                      />
                    </div>
                    <div className="config-input-item">
                      <label>Coluna A (Caracteres anteriores):</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        placeholder="0 = todo o restante"
                        value={splitRule.col1Length}
                        onChange={(e) =>
                          setSplitRule((r) => ({
                            ...r,
                            col1Length: parseInt(e.target.value) || 0,
                          }))
                        }
                      />
                      <span className="input-help">0 = pega todo o restante</span>
                    </div>
                  </>
                )}

                {splitRule.splitMode === '3' && (
                  <>
                    <div className="config-input-item">
                      <label>Coluna C (Caracteres do final):</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={splitRule.col3Length}
                        onChange={(e) =>
                          setSplitRule((r) => ({
                            ...r,
                            col3Length: parseInt(e.target.value) || 1,
                          }))
                        }
                      />
                    </div>
                    <div className="config-input-item">
                      <label>Coluna B (Caracteres do meio):</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={splitRule.col2Length}
                        onChange={(e) =>
                          setSplitRule((r) => ({
                            ...r,
                            col2Length: parseInt(e.target.value) || 1,
                          }))
                        }
                      />
                    </div>
                    <div className="config-input-item">
                      <label>Coluna A (Caracteres iniciais):</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        placeholder="0 = todo o restante"
                        value={splitRule.col1Length}
                        onChange={(e) =>
                          setSplitRule((r) => ({
                            ...r,
                            col1Length: parseInt(e.target.value) || 0,
                          }))
                        }
                      />
                      <span className="input-help">0 = pega todo o restante</span>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="config-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={splitRule.cleanSymbols}
                  onChange={(e) =>
                    setSplitRule((r) => ({ ...r, cleanSymbols: e.target.checked }))
                  }
                />
                Limpar caracteres especiais (ex: <code>()</code> <code>&lt;&gt;</code> espaços)
              </label>
            </div>

            {/* Live Preview */}
            {(() => {
              const sample = lastScanned || '(99)002146769234018047<>'
              const sampleParsed = parseCode(sample, splitRule)
              return (
                <div className="preview-box">
                  <div className="preview-title">Exemplo de Leitura:</div>
                  <div className="preview-raw">Original: <code>{sample}</code></div>
                  <div className="preview-cols">
                    <span className="preview-pill col-a">
                      Col A: <strong>{sampleParsed.colA || '(vazio)'}</strong>
                    </span>
                    {splitRule.splitMode !== '1' && (
                      <span className="preview-pill col-b">
                        Col B: <strong>{sampleParsed.colB || '(vazio)'}</strong>
                      </span>
                    )}
                    {splitRule.splitMode === '3' && (
                      <span className="preview-pill col-c">
                        Col C: <strong>{sampleParsed.colC || '(vazio)'}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
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
              <button className="btn btn-primary" onClick={exportCSV} title="Baixar CSV">
                <Download size={16} /> Exportar CSV
              </button>
              <button className="btn btn-danger" onClick={clearAll} title="Limpar tudo">
                <RotateCcw size={16} /> Limpar
              </button>
            </div>
          )}
        </div>

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


