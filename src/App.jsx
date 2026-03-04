
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
      snapshots: updatedSnapshots,
      currIdx,
      version: '2.0-board'
    }
    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `whiteboard-project.board`
    a.click()

    setSnapshots(updatedSnapshots)
  }

  const loadProject = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      // Support both new project format and old single-slide format
      if (data.version === '2.0-board' || (data.slides && data.snapshots)) {
        if (editorRef.current) {
          editorRef.current.selectAll().deleteShapes(editorRef.current.getSelectedShapeIds())
        }
        setSlides(data.slides || [])
        setSnapshots(data.snapshots || {})
        setCurrIdx(data.currIdx || 0)
      } else {
        // Fallback: If it's an old single-page .board file, load it into the current slide
        if (editorRef.current) {
          editorRef.current.store.loadSnapshot(data)
          alert("Legacy single-slide board loaded into current view.")
        }
      }
    } catch (err) {
      console.error("Load Error:", err)
      alert("Failed to load: " + err.message)
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
      <div className="main-canvas">
        <div className="toolbar">
          <label className="upload-btn">
            📂 {loading ? (status || 'Loading...') : 'Upload PDF/Images'}
            <input type="file" multiple accept="image/*,application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} disabled={loading} />
          </label>

          <div className="divider" />

          <button type="button" className="icon-btn" onClick={saveProject}>💾 Save Project (.board)</button>
          <label className="icon-btn">
            📂 Load Project (.board)
            <input type="file" accept=".board" onChange={loadProject} style={{ display: 'none' }} />
          </label>

          <div style={{ flex: 1 }} />

          <button type="button" className="action-btn" onClick={resetSlide} style={{ background: '#ef4444' }}>Reset Page</button>
          <button type="button" className="action-btn" onClick={exportPNG}>Export PNG</button>
          <button type="button" className="action-btn" onClick={() => setDark(!dark)}>{dark ? '☀️' : '🌙'}</button>
        </div>

        <div className="canvas-wrapper">
          <Tldraw
            autoFocus
            onMount={(editor) => {
              editorRef.current = editor
              editor.updateInstanceState({ isGridMode: false })
              // Force a re-run of the slide effect if slides are already loaded
              if (slides.length > 0) {
                setCurrIdx(c => c)
              }
            }}
            darkMode={dark}
          />
        </div>

        {slides.length > 0 && (
          <div className="floating-nav">
            <button type="button" className="nav-arrow" onClick={() => goToSlide(currIdx - 1)} disabled={currIdx === 0}>←</button>
            <div className="nav-info">Slide {currIdx + 1} of {slides.length}</div>
            <button type="button" className="nav-arrow" onClick={() => goToSlide(currIdx + 1)} disabled={currIdx === slides.length - 1}>→</button>
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
          position: fixed;
          top: 0;
          left: 0;
        }

        .main-canvas {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .toolbar {
          height: 60px;
          min-height: 60px;
          background: #1e293b;
          display: flex;
          align-items: center;
          padding: 0 20px;
          gap: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          z-index: 9999;
          position: relative;
        }

        .canvas-wrapper {
          flex: 1;
          height: calc(100vh - 60px);
          position: relative;
          z-index: 1;
        }

        .floating-nav {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: #1e293b;
          padding: 10px 25px;
          border-radius: 50px;
          display: flex;
          align-items: center;
          gap: 15px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.6);
          border: 1px solid #334155;
          z-index: 99999;
        }

        .nav-arrow {
          background: #334155;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .nav-arrow:hover:not(:disabled) {
          background: #3b82f6;
          transform: scale(1.1);
        }

        .nav-arrow:disabled {
          opacity: 0.2;
          cursor: not-allowed;
        }

        .nav-info {
          font-size: 14px;
          font-weight: 600;
          color: #94a3b8;
          min-width: 120px;
          text-align: center;
          font-family: monospace;
        }

        .upload-btn {
          background: #10b981;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: bold;
        }

        .icon-btn {
          background: #334155;
          color: #f1f5f9;
          border: 1px solid #475569;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
        }

        .action-btn {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
        }

        .divider {
          width: 1px;
          height: 24px;
          background: #475569;
        }

        .lock-toggle {
          padding: 6px 12px;
          border-radius: 8px;
          border: none;
          background: #334155;
          color: #3b82f6;
          font-weight: bold;
          font-size: 12px;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
