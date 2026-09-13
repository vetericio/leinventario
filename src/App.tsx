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
} from 'lucide-react'
import './App.css'

interface InventoryItem {
  id: string
  code: string
  quantity: number
  timestamp: string
}

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, audioCtx.currentTime) // A5 note
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.15)
  } catch {
    // ignore audio context issues
  }
}

function App() {
  const [mode, setMode] = useState<'camera' | 'file' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [copied, setCopied] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [items, setItems] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('leinventario_items')
    return saved ? JSON.parse(saved) : []
  })
  const [lastScanned, setLastScanned] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null)
  const lastScanTimeRef = useRef<number>(0)

  useEffect(() => {
    localStorage.setItem('leinventario_items', JSON.stringify(items))
  }, [items])

  const handleBarcodeRead = (code: string) => {
    const now = Date.now()
    // Prevent double reading within 1.5 seconds for identical code
    if (now - lastScanTimeRef.current < 1500) {
      return
    }
    lastScanTimeRef.current = now

    if (soundEnabled) {
      playBeep()
    }

    setLastScanned(code)

    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.code === code)
      const timeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
          timestamp: timeStr,
        }
        return updated
      } else {
        const newItem: InventoryItem = {
          id: Date.now().toString(),
          code,
          quantity: 1,
          timestamp: timeStr,
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
    if (confirm('Deseja realmente limpar toda a planilha de inventário?')) {
      setItems([])
      setLastScanned(null)
      localStorage.removeItem('leinventario_items')
    }
  }

  const exportCSV = () => {
    if (items.length === 0) return
    let csvContent = 'data:text/csv;charset=utf-8,#,Codigo_de_Barras,Quantidade,Hora_Leitura\n'
    items.forEach((item, index) => {
      csvContent += `${index + 1},"${item.code}",${item.quantity},"${item.timestamp}"\n`
    })

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `inventario_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const copyTable = () => {
    if (items.length === 0) return
    const text = items
      .map((item, idx) => `${idx + 1}.\t${item.code}\tQtd: ${item.quantity}\t(${item.timestamp})`)
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
                  <th>Código de Barras</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Quantidade</th>
                  <th style={{ width: '100px' }}>Hora</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="row-num">{index + 1}</td>
                    <td className="code-cell">{item.code}</td>
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
    </div>
  )
}

export default App


