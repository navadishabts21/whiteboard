
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
} from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'

// Use a more reliable worker source
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export default function App() {
  const [slides, setSlides] = useState([])
  const [currIdx, setCurrIdx] = useState(0)
  const [dark, setDark] = useState(true)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
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
    e.preventDefault()
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    setLoading(true)
    setStatus('Preparing...')
    const newSlides = []

    try {
      for (const file of files) {
        if (file.type === 'application/pdf') {
          setStatus('Reading PDF...')
          const arrayBuffer = await file.arrayBuffer()
          const loadingTask = pdfjs.getDocument({ data: arrayBuffer })

          const pdf = await loadingTask.promise
          const numPages = pdf.numPages

          for (let i = 1; i <= numPages; i++) {
            setStatus(`Processing page ${i} of ${numPages}...`)
            const page = await pdf.getPage(i)
            // Use 1.2 scale to balance quality and memory
            const viewport = page.getViewport({ scale: 1.2 })
            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            canvas.height = viewport.height
            canvas.width = viewport.width

            await page.render({ canvasContext: context, viewport }).promise

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
            newSlides.push(URL.createObjectURL(blob))
          }
        } else if (file.type.startsWith('image/')) {
          newSlides.push(URL.createObjectURL(file))
        }
      }

      if (newSlides.length > 0) {
        setSlides(prev => [...prev, ...newSlides])
        setCurrIdx(slides.length) // Jump to the first newly added slide
      }
    } catch (error) {
      console.error('PDF Error:', error)
      alert('Upload failed. Please try a smaller file or convert your PDF pages to images.')
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  const goToSlide = (index) => {
    if (index < 0 || index >= slides.length) return
    saveCurrentSnapshot()
    setCurrIdx(index)
  }

  // Effect to load slide snapshot
  useEffect(() => {
    if (!editorRef.current || slides.length === 0) return

    const editor = editorRef.current
    const targetSnapshot = snapshots[currIdx]

    if (targetSnapshot) {
      console.log(`Loading snapshot for slide ${currIdx + 1}`)
      editor.store.loadSnapshot(targetSnapshot)
    } else {
      console.log(`No snapshot for slide ${currIdx + 1}, creating background`)
      editor.selectAll().deleteShapes(editor.getSelectedShapeIds())
      const imageUrl = slides[currIdx]
      const id = `slide-bg-${currIdx}`

      editor.createShape({
        id,
        type: 'image',
        x: 0,
        y: 0,
        props: {
          w: 1000,
          h: 700,
          src: imageUrl,
          name: `Slide ${currIdx + 1}`,
        },
      })

      editor.select(id)
      editor.setCamera({ x: -100, y: -50, z: 0.7 })
      editor.toggleLock([id])
      editor.selectNone()
      setIsLocked(true)
    }
  }, [currIdx, slides, snapshots])

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
      const shapes = editor.getCurrentPageShapes()
      const slideBG = shapes.find(s => s.id.startsWith('slide-bg-'))
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

  const saveBoard = () => {
    if (editorRef.current) {
      const snapshot = editorRef.current.store.getSnapshot()
      const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `slide-${currIdx + 1}.board`
      a.click()
    }
  }

  const loadBoard = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    if (editorRef.current) {
      editorRef.current.store.loadSnapshot(JSON.parse(text))
    }
  }

  const saveProject = () => {
    if (!editorRef.current) return

    // CAPTURE CURRENT DRAWINGS IMMEDIATELY
    const currentSnapshot = editorRef.current.store.getSnapshot()
    const updatedSnapshots = { ...snapshots, [currIdx]: currentSnapshot }

    const projectData = {
      slides,
      snapshots: updatedSnapshots, // Use the freshly captured snapshots
      currIdx,
      version: '2.0'
    }
    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `presentation-project.navdis`
    a.click()

    // Sync state as well
    setSnapshots(updatedSnapshots)
  }

  const loadProject = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (data.version === '2.0' || (data.slides && data.snapshots)) {
        // Force reset current view before bulk loading
        if (editorRef.current) {
          editorRef.current.selectAll().deleteShapes(editorRef.current.getSelectedShapeIds())
        }

        // Apply state updates
        setSlides(data.slides || [])
        setSnapshots(data.snapshots || {})
        setCurrIdx(data.currIdx || 0)

        console.log("Project data applied to state")
      } else {
        alert("This file doesn't look like a valid project file.")
      }
    } catch (err) {
      console.error("Load Project Error:", err)
      alert("Failed to load project: " + err.message)
    } finally {
      e.target.value = null
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        saveProject()
      }
      if (e.key === 'ArrowLeft') {
        goToSlide(currIdx - 1)
      } else if (e.key === 'ArrowRight') {
        goToSlide(currIdx + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currIdx, slides, snapshots])

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      {slides.length > 0 && (
        <div className="slide-deck">
          <div className="deck-header">Slide Deck</div>
          <div className="thumb-container">
            {slides.map((s, i) => (
              <div
                key={i}
                className={`slide-thumb ${currIdx === i ? 'active' : ''}`}
                onClick={() => goToSlide(i)}
              >
                <div className="thumb-preview">
                  <img src={s} alt="" />
                </div>
                <div className="thumb-label">Slide {i + 1}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="main-canvas">
        <div className="toolbar">
          <label className="upload-btn">
            📂 {loading ? (status || 'Loading...') : 'Upload PDF/Images'}
            <input type="file" multiple accept="image/*,application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} disabled={loading} />
          </label>

          <div className="divider" />

          <button type="button" className="icon-btn" onClick={saveProject}>💾 Save Project</button>
          <label className="icon-btn">
            📂 Load Project
            <input type="file" accept=".navdis" onChange={loadProject} style={{ display: 'none' }} />
          </label>

          <div style={{ flex: 1 }} />

          <div className="slide-tools">
            <label className="action-btn" style={{ background: '#8b5cf6' }}>
              📥 Load Board
              <input type="file" accept=".board" onChange={loadBoard} style={{ display: 'none' }} />
            </label>
            <button type="button" className="action-btn" style={{ background: '#8b5cf6' }} onClick={saveBoard}>📤 Save Board</button>
            <button type="button" className="action-btn" style={{ background: '#ef4444' }} onClick={resetSlide}>Reset Page</button>
          </div>

          <button type="button" className="action-btn" onClick={exportPNG}>Export PNG</button>
          <button type="button" className="action-btn" onClick={() => setDark(!dark)}>{dark ? '☀️' : '🌙'}</button>
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

        {slides.length > 0 && (
          <div className="floating-nav">
            <button type="button" onClick={() => goToSlide(currIdx - 1)} disabled={currIdx === 0}>←</button>
            <div className="nav-info">Slide {currIdx + 1} of {slides.length}</div>
            <button type="button" onClick={() => goToSlide(currIdx + 1)} disabled={currIdx === slides.length - 1}>→</button>
            <div className="divider" />
            <button type="button" className="lock-toggle" onClick={toggleSlideLock}>
              {isLocked ? '🔒 Locked' : '🔓 Unlocked'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        .app-layout {
          height: 100vh;
          width: 100vw;
          display: flex;
          background: #0f172a;
          color: white;
          overflow: hidden;
        }

        .slide-deck {
          width: 220px;
          height: 100vh;
          background: #1e293b;
          border-right: 1px solid rgba(255,255,255,0.1);
          display: flex;
          flex-direction: column;
        }

        .deck-header {
          padding: 20px;
          font-weight: bold;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #94a3b8;
        }

        .thumb-container {
          flex: 1;
          overflow-y: auto;
          padding: 0 15px 20px;
        }

        .slide-thumb {
          margin-bottom: 20px;
          padding: 8px;
          border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }

        .slide-thumb:hover {
          background: rgba(255,255,255,0.08);
        }

        .slide-thumb.active {
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.1);
        }

        .thumb-preview {
          aspect-ratio: 16/10;
          background: #000;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 6px;
        }

        .thumb-preview img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .thumb-label {
          font-size: 11px;
          text-align: center;
          color: #64748b;
        }

        .slide-thumb.active .thumb-label {
          color: #3b82f6;
          font-weight: bold;
        }

        .main-canvas {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .toolbar {
          height: 60px;
          background: rgba(30, 41, 59, 0.8);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          padding: 0 20px;
          gap: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          z-index: 10;
        }

        .upload-btn {
          background: #10b981;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: bold;
          white-space: nowrap;
        }

        .icon-btn {
          background: transparent;
          color: #94a3b8;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
        }

        .icon-btn:hover {
          background: rgba(255,255,255,0.05);
          color: white;
        }

        .divider {
          width: 1px;
          height: 24px;
          background: rgba(255,255,255,0.1);
          margin: 0 4px;
        }

        .action-btn {
          background: #334155;
          color: white;
          border: none;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
        }

        .slide-tools {
          display: flex;
          gap: 8px;
        }

        .canvas-wrapper {
          flex: 1;
          position: relative;
        }

        .floating-nav {
          position: absolute;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.9);
          backdrop-filter: blur(15px);
          padding: 8px 20px;
          border-radius: 50px;
          display: flex;
          align-items: center;
          gap: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.1);
          z-index: 100;
        }

        .floating-nav button {
          background: transparent;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 4px 10px;
          border-radius: 10px;
        }

        .floating-nav button:hover:not(:disabled) {
          background: rgba(255,255,255,0.1);
        }

        .floating-nav button:disabled {
          opacity: 0.2;
          cursor: not-allowed;
        }

        .nav-info {
          font-size: 13px;
          font-weight: bold;
          color: #94a3b8;
          min-width: 100px;
          text-align: center;
        }

        .lock-toggle {
          font-size: 12px !important;
          color: #3b82f6 !important;
          font-weight: bold;
        }
      `}</style>
    </div>
  )
}
