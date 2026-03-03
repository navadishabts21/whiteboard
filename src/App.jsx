
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
            const viewport = page.getViewport({ scale: 1.5 })
            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            canvas.height = viewport.height
            canvas.width = viewport.width

            await page.render({ canvasContext: context, viewport }).promise
            newSlides.push(canvas.toDataURL('image/png'))
          }
        } else if (file.type.startsWith('image/')) {
          newSlides.push(URL.createObjectURL(file))
        }
      }

      if (newSlides.length > 0) {
        setSlides(prev => [...prev, ...newSlides])
      }
    } catch (error) {
      console.error('PDF Error:', error)
      alert('Error loading PDF: ' + error.message + '\nPlease try a different PDF or images.')
    } finally {
      setLoading(false)
      setStatus('')
    }
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

  const saveBoard = () => {
    if (editorRef.current) {
      const snapshot = editorRef.current.store.getSnapshot()
      const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `whiteboard-slide-${currIdx + 1}.board`
      a.click()
    }
  }

  const loadBoard = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    const text = await file.text()
    if (editorRef.current) {
      editorRef.current.store.loadSnapshot(JSON.parse(text))
    }
  }

  const saveProject = () => {
    // Save current slide before exporting everything
    saveCurrentSnapshot()
    const projectData = {
      slides,
      snapshots,
      currIdx,
      version: '2.0'
    }
    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `presentation-project.navdis`
    a.click()
  }

  const loadProject = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    const text = await file.text()
    const data = JSON.parse(text)

    if (data.version === '2.0') {
      setSlides(data.slides || [])
      setSnapshots(data.snapshots || {})
      setCurrIdx(data.currIdx || 0)
    } else {
      // Handle old board files as a single slide if possible
      alert("This is an old board file. Use 'Load Slide' instead to load it into the current page.")
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
    <div className="app-container">
      <div className="toolbar">
        <label className="upload-btn">
          📂 {loading ? (status || 'Loading...') : 'Upload Presentation (PDF/Images)'}
          <input type="file" multiple accept="image/*,application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} disabled={loading} />
        </label>

        <div className="project-actions">
          <button className="icon-btn" title="Save Entire Project" onClick={saveProject}>💾 Save Project</button>
          <label className="icon-btn" title="Load Project">
            📂 Load Project
            <input type="file" accept=".navdis" onChange={loadProject} style={{ display: 'none' }} />
          </label>
        </div>

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

        <div className="slide-tools">
          <label className="action-btn" style={{ background: '#8b5cf6' }}>
            📥 Load Slide
            <input type="file" accept=".board" onChange={loadBoard} style={{ display: 'none' }} />
          </label>
          <button className="action-btn" style={{ background: '#8b5cf6' }} onClick={saveBoard}>📤 Save Slide</button>
          <button className="action-btn" style={{ background: '#ef4444' }} onClick={resetSlide}>Reset Slide</button>
        </div>

        <button className="action-btn" onClick={exportPNG}>Export PNG</button>
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

        .project-actions {
          display: flex;
          gap: 8px;
          border-left: 1px solid rgba(255,255,255,0.1);
          padding-left: 15px;
        }

        .slide-tools {
          display: flex;
          gap: 8px;
          margin-right: 15px;
        }

        .icon-btn {
          background: rgba(255, 255, 255, 0.05);
          color: #94a3b8;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }

        .icon-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border-color: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  )
}
