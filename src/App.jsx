
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
} from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'

// Set worker source for pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

export default function App() {
  const [slides, setSlides] = useState([])
  const [currIdx, setCurrIdx] = useState(0)
  const [dark, setDark] = useState(true)
  const [loading, setLoading] = useState(false)
  const editorRef = useRef(null)

  // Map of slide index to their respective snapshots
  const [snapshots, setSnapshots] = useState({})

  const saveCurrentSnapshot = (index = currIdx) => {
    if (editorRef.current && slides.length > 0) {
      const snapshot = editorRef.current.store.getSnapshot()
      setSnapshots(prev => ({ ...prev, [index]: snapshot }))
    }
  }

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    setLoading(true)
    const newSlides = []

    for (const file of files) {
      if (file.type === 'application/pdf') {
        // Process PDF
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 2 }) // High resolution
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          canvas.height = viewport.height
          canvas.width = viewport.width

          await page.render({ canvasContext: context, viewport }).promise
          newSlides.push(canvas.toDataURL('image/png'))
        }
      } else if (file.type.startsWith('image/')) {
        // Process Image
        newSlides.push(URL.createObjectURL(file))
      }
    }

    setSlides(prev => [...prev, ...newSlides])
    setLoading(false)
  }

  const goToSlide = (index) => {
    if (index < 0 || index >= slides.length) return

    // Save current slide's snapshot before switching
    saveCurrentSnapshot()
    setCurrIdx(index)
  }

  // Load snapshot when current slide changes
  useEffect(() => {
    if (!editorRef.current || slides.length === 0) return

    const editor = editorRef.current

    // Snapshot for the target slide
    const targetSnapshot = snapshots[currIdx]

    if (targetSnapshot) {
      editor.store.loadSnapshot(targetSnapshot)
    } else {
      // CLEAR EVERYTHING for new slide
      editor.selectAll().deleteShapes(editor.getSelectedShapeIds())

      // Centered Slide Image
      const imageUrl = slides[currIdx]
      const id = 'slide-bg-' + Date.now()

      editor.createShape({
        id,
        type: 'image',
        x: 0,
        y: 0,
        props: {
          w: 1200, // Large default width
          h: 800,
          src: imageUrl,
          name: `Slide ${currIdx + 1}`,
        },
      })

      // Select the slide image and lock it
      editor.select(id)
      editor.setCamera({ x: -200, y: -100, z: 0.6 })
      editor.toggleLock([id])
      editor.selectNone()
      setIsLocked(true)
    }
  }, [currIdx, slides])

  const exportPNG = async () => {
    const editor = editorRef.current
    if (!editor) return

    const svg = await editor.getSvg([...editor.getCurrentPageShapeIds()])
    if (!svg) return

    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = `whiteboard-slide-${currIdx + 1}.png`
      a.click()
    }
    img.src = url
  }

  const [isLocked, setIsLocked] = useState(true)

  const toggleSlideLock = () => {
    if (editorRef.current) {
      const editor = editorRef.current
      const slideBG = editor.getCurrentPageShapes().find(s => s.id.startsWith('slide-bg-'))
      if (slideBG) {
        editor.toggleLock([slideBG.id])
        setIsLocked(!slideBG.isLocked)
      }
    }
  }

  const resetSlide = () => {
    if (editorRef.current) {
      const editor = editorRef.current
      const allShapes = editor.getCurrentPageShapes()
      const shapesToDelete = allShapes.filter(s => !s.id.startsWith('slide-bg-'))
      editor.deleteShapes(shapesToDelete.map(s => s.id))
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        goToSlide(currIdx - 1)
      } else if (e.key === 'ArrowRight') {
        goToSlide(currIdx + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currIdx, slides])

  return (
    <div className="app-container">
      <div className="toolbar">
        <label className="upload-btn">
          📂 {loading ? 'Loading...' : 'Upload Presentation (PDF/Images)'}
          <input type="file" multiple accept="image/*,application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} disabled={loading} />
        </label>

        {slides.length > 0 && (
          <div className="navigation">
            <button className="nav-btn" onClick={() => goToSlide(currIdx - 1)} disabled={currIdx === 0}>←</button>
            <div className="slide-indicator">
              Slide <span>{currIdx + 1}</span> of <span>{slides.length}</span>
            </div>
            <button className="nav-btn" onClick={() => goToSlide(currIdx + 1)} disabled={currIdx === slides.length - 1}>→</button>
          </div>
        )}

        {slides.length > 0 && (
          <button
            className="action-btn"
            style={{ background: isLocked ? '#64748b' : '#3b82f6' }}
            onClick={toggleSlideLock}
          >
            {isLocked ? '🔒 Locked' : '🔓 Unlocked'}
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button className="action-btn" style={{ background: '#ef4444' }} onClick={resetSlide}>Reset Slide</button>
        <button className="action-btn" onClick={exportPNG}>Export</button>
        <button className="action-btn" onClick={() => setDark(!dark)}>{dark ? '☀️ Light' : '🌙 Dark'}</button>
      </div>

      <div className="canvas-wrapper">
        <Tldraw
          autoFocus
          onMount={(editor) => {
            editorRef.current = editor
            editor.updateInstanceState({ isGridMode: false })
          }}
          darkMode={dark}
        />
      </div>

      <style>{`
        .app-container {
          height: 100vh;
          width: 100vw;
          display: flex;
          flex-direction: column;
          background: #0f172a;
          overflow: hidden;
        }

        .toolbar {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 8px 16px;
          background: rgba(30, 41, 59, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          z-index: 1000;
          min-width: 600px;
        }

        .upload-btn {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          padding: 8px 16px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          white-space: nowrap;
        }

        .upload-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.4);
        }

        .navigation {
          display: flex;
          align-items: center;
          background: rgba(15, 23, 42, 0.5);
          padding: 4px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .nav-btn {
          background: transparent;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 12px;
          border-radius: 8px;
          transition: background 0.2s;
        }

        .nav-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }

        .nav-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .slide-indicator {
          font-size: 13px;
          color: #94a3b8;
          padding: 0 15px;
          font-family: 'JetBrains Mono', monospace;
        }

        .slide-indicator span {
          color: white;
          font-weight: bold;
        }

        .action-btn {
          background: #334155;
          color: white;
          border: none;
          padding: 8px 14px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: #475569;
        }

        .canvas-wrapper {
          flex: 1;
          position: relative;
        }
      `}</style>
    </div>
  )
}
