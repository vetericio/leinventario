import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode'
import {
  QrCode,
  Camera,
  Upload,
  Copy,
  ExternalLink,
  Check,
  History,
  Trash2,
  ScanCheck,
} from 'lucide-react'
import './App.css'

interface HistoryItem {
  id: string
  text: string
  timestamp: string
}

function App() {
  const [mode, setMode] = useState<'camera' | 'file'>('camera')
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('qr_scan_history')
    return saved ? JSON.parse(saved) : []
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)

  useEffect(() => {
    localStorage.setItem('qr_scan_history', JSON.stringify(history))
  }, [history])

  const handleScanSuccess = (decodedText: string) => {
    setScanResult(decodedText)
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      text: decodedText,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
    setHistory((prev) => [newItem, ...prev.filter((item) => item.text !== decodedText)])
  }

  useEffect(() => {
    if (mode === 'camera') {
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      }

      scannerRef.current = new Html5QrcodeScanner('qr-reader', config, false)
      scannerRef.current.render(
        (decodedText) => {
          handleScanSuccess(decodedText)
        },
        () => {
          // ignore scan errors
        }
      )
    } else {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error)
      }
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error)
      }
    }
  }, [mode])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const html5Qrcode = new Html5Qrcode('qr-reader-file')
    try {
      const decodedText = await html5Qrcode.scanFile(file, true)
      handleScanSuccess(decodedText)
    } catch (err) {
      alert('Não foi possível ler nenhum QR Code nesta imagem.')
      console.error(err)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isUrl = (text: string) => {
    try {
      new URL(text)
      return true
    } catch {
      return false
    }
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem('qr_scan_history')
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1>
          <QrCode size={38} color="var(--accent)" /> Leitor de QR Code
        </h1>
        <p>Escaneie QR Codes com sua câmera ou carregue uma imagem localmente.</p>
      </header>

      <div className="mode-tabs">
        <button
          className={`tab-btn ${mode === 'camera' ? 'active' : ''}`}
          onClick={() => {
            setMode('camera')
            setScanResult(null)
          }}
        >
          <Camera size={18} /> Câmera
        </button>
        <button
          className={`tab-btn ${mode === 'file' ? 'active' : ''}`}
          onClick={() => {
            setMode('file')
            setScanResult(null)
          }}
        >
          <Upload size={18} /> Enviar Imagem
        </button>
      </div>

      <div className="scanner-card">
        {mode === 'camera' ? (
          <div id="qr-reader"></div>
        ) : (
          <div>
            <div
              className="upload-box"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="upload-icon" />
              <p><strong>Clique para selecionar uma imagem</strong></p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                Suporta PNG, JPG, JPEG, WEBP
              </p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden-input"
              onChange={handleFileUpload}
            />
            <div id="qr-reader-file" style={{ display: 'none' }}></div>
          </div>
        )}

        {scanResult && (
          <div className="result-card">
            <div className="result-header">
              <span className="result-title">
                <ScanCheck size={20} /> Resultado Lido
              </span>
            </div>
            <div className="result-content">{scanResult}</div>
            <div className="action-btns">
              <button
                className="btn btn-primary"
                onClick={() => copyToClipboard(scanResult)}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              {isUrl(scanResult) && (
                <a
                  href={scanResult}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={16} /> Abrir Link
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <section className="history-section">
          <div className="history-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <History size={20} /> Histórico de Leituras
            </h2>
            <button className="clear-btn" onClick={clearHistory}>
              <Trash2 size={16} /> Limpar
            </button>
          </div>
          <div className="history-list">
            {history.map((item) => (
              <div key={item.id} className="history-item">
                <div>
                  <div className="history-text">{item.text}</div>
                  <div className="history-time">{item.timestamp}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    className="btn"
                    onClick={() => copyToClipboard(item.text)}
                    title="Copiar"
                  >
                    <Copy size={14} />
                  </button>
                  {isUrl(item.text) && (
                    <a
                      href={item.text}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      title="Abrir"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default App

