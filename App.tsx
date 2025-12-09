import React, { useState, useEffect, useRef } from 'react';
import { generateStoryScenes, generateColoringPage, generateRandomTheme, enhanceTheme, getThemeSuggestions } from './services/geminiService';
import { AppState, BookConfig, GeneratedPage, SavedProject } from './types';
import { ChatWidget } from './components/ChatWidget';
import { Button } from './components/Button';
import { PrintBook } from './components/PrintBook';
import JSZip from 'jszip';

// Art Style Definitions
const ART_STYLES = [
  { id: 'Whimsical', name: 'Whimsical', icon: '✨', desc: 'Classic storybook' },
  { id: 'Disney Animation', name: 'Cartoon', icon: '🐭', desc: 'Expressive & cute' },
  { id: '8-Bit Pixel', name: 'Pixel Art', icon: '👾', desc: 'Retro gaming blocky' },
  { id: 'Mandala', name: 'Pattern', icon: '🌸', desc: 'Complex geometric' },
  { id: 'Anime', name: 'Anime', icon: '👺', desc: 'Japanese animation' },
  { id: 'Lego', name: 'Blocky', icon: '🧱', desc: 'Brick construction' },
];

export default function App() {
  const [apiKey, setApiKey] = useState<string>('');
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  
  const [config, setConfig] = useState<BookConfig>({
    childName: '',
    theme: '',
    pageCount: 5,
    aspectRatio: '3:4',
    imageSize: '1K',
    artStyle: 'Whimsical',
    ageGroup: 'kids'
  });

  const [pages, setPages] = useState<GeneratedPage[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [tempKeyInput, setTempKeyInput] = useState('');
  const [historyItems, setHistoryItems] = useState<SavedProject[]>([]);
  const [promptLoading, setPromptLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [suggestedThemes, setSuggestedThemes] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Initialize
  useEffect(() => {
    // API Key
    if (process.env.API_KEY) {
      setApiKey(process.env.API_KEY);
    } else {
      const stored = localStorage.getItem('gemini_api_key');
      if (stored) setApiKey(stored);
    }

    // History
    const savedHistory = localStorage.getItem('dreamlines_history');
    if (savedHistory) {
      try {
        setHistoryItems(JSON.parse(savedHistory));
      } catch (e) { console.error("History parse error", e); }
    }

    // Theme
    const themePref = localStorage.getItem('dreamlines_theme');
    if (themePref === 'light') setIsDarkMode(false);
  }, []);

  // Theme effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('dreamlines_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Load dynamic suggestions when API key is available
  useEffect(() => {
    if (apiKey) {
      loadSuggestions();
    }
  }, [apiKey]);

  const loadSuggestions = async () => {
    setSuggestionsLoading(true);
    try {
      const suggestions = await getThemeSuggestions(apiKey);
      setSuggestedThemes(suggestions);
    } catch (e) {
      console.error("Failed to load suggestions", e);
      setSuggestedThemes(["Space Dinosaurs", "Underwater Kingdom", "Robot Olympics"]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTerminalLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const handleSaveKey = () => {
    if (tempKeyInput.trim()) {
      setApiKey(tempKeyInput.trim());
      localStorage.setItem('gemini_api_key', tempKeyInput.trim());
    }
  };

  const handleClearKey = () => {
    setApiKey('');
    localStorage.removeItem('gemini_api_key');
    setTempKeyInput('');
  };

  const handlePromptButton = async () => {
    if (!apiKey) return;
    setPromptLoading(true);
    setValidationError('');
    try {
      if (!config.theme.trim()) {
        // Random Mode
        const randomTheme = await generateRandomTheme(apiKey);
        setConfig(prev => ({ ...prev, theme: randomTheme }));
      } else {
        // Enhance Mode
        const enhanced = await enhanceTheme(config.theme, apiKey);
        setConfig(prev => ({ ...prev, theme: enhanced }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPromptLoading(false);
    }
  };

  const saveProjectToHistory = (newPages: GeneratedPage[], newConfig: BookConfig) => {
    try {
      const project: SavedProject = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        config: newConfig,
        pages: newPages
      };
      // Keep only the last 3 items to avoid LocalStorage 5MB limit crash
      const updated = [project, ...historyItems].slice(0, 3); 
      setHistoryItems(updated);
      localStorage.setItem('dreamlines_history', JSON.stringify(updated));
    } catch (e) {
      console.warn("LocalStorage quota exceeded. History not saved.", e);
      addLog("Warning: Local storage full. Project not saved to history.");
    }
  };

  const loadProject = (project: SavedProject) => {
    setConfig(project.config);
    setPages(project.pages);
    setAppState(AppState.COMPLETED);
    setShowHistory(false);
  };

  const startGeneration = async () => {
    setValidationError('');
    if (!apiKey) return;
    if (!config.childName.trim()) {
      setValidationError("Please enter the child's name.");
      return;
    }

    setAppState(AppState.GENERATING_STORY);
    setTerminalLogs([]);
    addLog("Initializing Dream Engine v2.0...");
    
    // Auto-generate theme if empty
    let finalTheme = config.theme;
    if (!finalTheme.trim()) {
      addLog("No theme detected. Engaging creative matrix...");
      try {
        finalTheme = await generateRandomTheme(apiKey);
        addLog(`Theme generated: "${finalTheme}"`);
        // Update state so the UI reflects the generated theme
        setConfig(prev => ({ ...prev, theme: finalTheme }));
      } catch (e) {
        finalTheme = "Magical Forest Adventure"; // absolute fallback
      }
    }

    addLog(`Config: "${config.childName}" | Style: ${config.artStyle} | Pages: ${config.pageCount}`);
    
    try {
      const sceneDescriptions = await generateStoryScenes(config.childName, finalTheme, config.pageCount, apiKey);
      
      if (sceneDescriptions.length === 0) throw new Error("No scenes generated");

      addLog(`Blueprint acquired. ${sceneDescriptions.length} scenes ready.`);
      
      const initialPages: GeneratedPage[] = sceneDescriptions.map((desc, i) => ({
        id: `page-${i}`,
        sceneDescription: desc,
        status: 'pending'
      }));

      setPages(initialPages);
      setAppState(AppState.GENERATING_IMAGES);
      await generateImagesSequence(initialPages, finalTheme);

    } catch (error) {
      console.error("Generation failed", error);
      addLog("CRITICAL ERROR: Neural path disconnect.");
      setAppState(AppState.SETUP);
      alert("Something went wrong. Please check your API key.");
    }
  };

  const generateImagesSequence = async (currentPages: GeneratedPage[], currentTheme: string) => {
    const updatedPages = [...currentPages];
    
    for (let i = 0; i < updatedPages.length; i++) {
      updatedPages[i].status = 'generating';
      setPages([...updatedPages]);
      addLog(`Rendering Page ${i + 1}/${updatedPages.length} [${config.artStyle}]...`);

      const imageUrl = await generateColoringPage(
        updatedPages[i].sceneDescription,
        config.artStyle,
        config.ageGroup,
        config.aspectRatio,
        config.imageSize,
        apiKey
      );

      if (imageUrl) {
        updatedPages[i].imageUrl = imageUrl;
        updatedPages[i].status = 'completed';
        addLog(`Page ${i + 1} rendering complete.`);
      } else {
        updatedPages[i].status = 'failed';
        addLog(`Page ${i + 1} failed.`);
      }
      setPages([...updatedPages]);
    }

    addLog("Compilation complete. Finalizing assets...");
    
    saveProjectToHistory(updatedPages, { ...config, theme: currentTheme });
    setAppState(AppState.COMPLETED);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder(`dreamlines-${config.childName.replace(/\s+/g, '-')}`);
    
    if (folder) {
        // Add Cover Info
        folder.file("info.txt", `Title: ${config.theme}\nFor: ${config.childName}\nStyle: ${config.artStyle}`);

        // Add Images
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            if (page.imageUrl) {
                // Determine mime type from data URL
                const mime = page.imageUrl.split(',')[0].match(/:(.*?);/)?.[1] || 'image/png';
                const ext = mime.split('/')[1];
                const response = await fetch(page.imageUrl);
                const blob = await response.blob();
                folder.file(`page-${i + 1}.${ext}`, blob);
            }
        }
        
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `dreamlines-${config.childName}.zip`;
        link.click();
    }
  };

  const handleUniversalShare = async () => {
    const title = `DreamLines: ${config.theme}`;
    const text = `I made a custom coloring book for ${config.childName} with DreamLines AI!`;
    
    if (navigator.share) {
      try {
        // Try to share the first generated image if available
        const coverPage = pages.find(p => p.imageUrl && p.status === 'completed');
        
        if (coverPage && coverPage.imageUrl) {
           const blob = await (await fetch(coverPage.imageUrl)).blob();
           const file = new File([blob], 'dreamlines-page.png', { type: blob.type });
           
           if (navigator.canShare && navigator.canShare({ files: [file] })) {
             await navigator.share({
               title,
               text,
               files: [file]
             });
             return;
           }
        }
        
        // Fallback to text share
        await navigator.share({ title, text, url: window.location.href });
        
      } catch (err) {
        console.warn('Share cancelled or failed', err);
      }
    } else {
      // Fallback for desktop browsers without share API
      alert("Use the download buttons to share your creation!");
    }
  };

  const handleTwitterShare = async () => {
    // If mobile/supporting, try native share first (allows image)
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      handleUniversalShare();
    } else {
      // Desktop fallback: Web Intent (Text only)
      const text = `I just created a custom "${config.theme}" coloring book for ${config.childName} using DreamLines AI! 🎨✨`;
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const handlePinterestShare = () => {
     // Pin the first image
     const coverPage = pages.find(p => p.imageUrl);
     if (coverPage?.imageUrl) {
       const url = window.location.href;
       const desc = `DreamLines Coloring Book: ${config.theme}`;
       window.open(`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&media=${encodeURIComponent(coverPage.imageUrl)}&description=${encodeURIComponent(desc)}`, '_blank');
     } else {
       alert("No image to pin yet!");
     }
  };

  const resetApp = () => {
    setAppState(AppState.SETUP);
    setPages([]);
    setTerminalLogs([]);
  };

  // ---------------- UI RENDER ----------------

  if (!apiKey) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none"></div>
        <div className="relative glass-panel p-8 md:p-12 rounded-2xl max-w-sm w-full border-t border-indigo-500/20 animate-scale-in">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-cyan-500 rounded-xl mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-8 animate-float">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">DreamLines</h1>
            <p className="text-slate-400 text-sm">Enter Gemini API Key to Initialize</p>
          </div>
          <div className="space-y-4">
             <input 
                type="password"
                value={tempKeyInput}
                onChange={(e) => setTempKeyInput(e.target.value)}
                placeholder="sk-..."
                className="glass-input w-full px-4 py-3 rounded-lg text-white placeholder-slate-600 outline-none text-center tracking-widest"
             />
             <Button onClick={handleSaveKey} disabled={!tempKeyInput} className="w-full">
               Start Engine
             </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col no-print relative transition-colors duration-500">
      <div className="fixed inset-0 bg-grid z-0 opacity-20 pointer-events-none"></div>
      
      {/* Navbar */}
      <header className="relative z-20 border-b border-[var(--border-color)] bg-[var(--card-bg)] backdrop-blur-xl sticky top-0 transition-all duration-300">
        <div className="container mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={resetApp}>
            <div className="w-7 h-7 bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-lg shadow-lg shadow-indigo-500/20 group-hover:rotate-12 transition-transform"></div>
            <h1 className="text-lg font-bold tracking-tight">DreamLines</h1>
          </div>
          <div className="flex items-center gap-3">
             {/* History Toggle */}
             {historyItems.length > 0 && (
                <button onClick={() => setShowHistory(!showHistory)} className="p-2 hover:bg-[var(--border-color)] rounded-full transition-colors active:scale-90" title="History">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
                   </svg>
                </button>
             )}
             {/* Theme Toggle */}
             <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 hover:bg-[var(--border-color)] rounded-full transition-colors active:scale-90" title="Toggle Theme">
                {isDarkMode ? '☀️' : '🌙'}
             </button>
             <button onClick={handleClearKey} className="ml-2 text-xs font-bold opacity-60 hover:opacity-100 transition-colors uppercase tracking-wider">
               Exit
             </button>
          </div>
        </div>
      </header>

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 w-80 bg-[var(--card-bg)] backdrop-blur-xl border-l border-[var(--border-color)] z-50 p-6 overflow-y-auto animate-slide-up shadow-2xl">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg">Your Studio</h3>
              <button onClick={() => setShowHistory(false)} className="text-sm opacity-50 hover:opacity-100 hover:text-red-400 transition-colors">Close</button>
           </div>
           <div className="space-y-4">
              {historyItems.map((item) => (
                 <div key={item.id} onClick={() => loadProject(item)} className="p-4 rounded-xl border border-[var(--border-color)] hover:border-indigo-500 cursor-pointer transition-all hover:bg-[var(--border-color)] group">
                    <div className="font-bold text-sm truncate group-hover:text-indigo-400 transition-colors">{item.config.theme || 'Untitled'}</div>
                    <div className="text-xs opacity-50 mb-2">{item.config.childName} • {new Date(item.timestamp).toLocaleDateString()}</div>
                    <div className="flex gap-1">
                       {item.pages.slice(0,3).map((p, i) => (
                          <div key={i} className="w-8 h-10 bg-[var(--border-color)] rounded-sm overflow-hidden opacity-80">
                             {p.imageUrl && <img src={p.imageUrl} className="w-full h-full object-cover" />}
                          </div>
                       ))}
                    </div>
                 </div>
              ))}
           </div>
        </div>
      )}

      <main className="relative z-10 flex-1 container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[calc(100vh-140px)]">
        
        {/* ================= SETUP UI ================= */}
        {appState === AppState.SETUP && (
          <div className="w-full max-w-xl animate-slide-up">
            
            <div className="text-center mb-8 relative">
               {/* Background Decorative Blobs */}
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl animate-pulse-slow pointer-events-none"></div>
               
               <h2 className="text-4xl font-black tracking-tight mb-3 relative z-10">
                 Create Magic
               </h2>
               <p className="text-[var(--text-muted)] relative z-10">Design a custom coloring book in seconds.</p>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-[var(--border-color)] shadow-2xl relative overflow-hidden transition-all hover:shadow-[0_0_40px_-10px_rgba(99,102,241,0.2)]">
                {/* Floating orbs inside card */}
                <div className="absolute top-[-20px] right-[-20px] w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none animate-float"></div>
                <div className="absolute bottom-[-20px] left-[-20px] w-40 h-40 bg-purple-500/10 rounded-full blur-2xl pointer-events-none animate-float" style={{animationDelay: '2s'}}></div>

                {/* Inputs */}
                <div className="space-y-6 relative z-10">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">Child's Name</label>
                    <input
                      type="text"
                      value={config.childName}
                      onChange={(e) => setConfig({...config, childName: e.target.value})}
                      placeholder="Who is this for?"
                      className="glass-input w-full px-5 py-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium text-lg transition-all"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">Adventure Theme (Optional)</label>
                    <div className="relative group">
                      <input
                        type="text"
                        value={config.theme}
                        onChange={(e) => setConfig({...config, theme: e.target.value})}
                        placeholder="Leave empty for a surprise..."
                        className="glass-input w-full px-5 py-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium text-lg pr-12 transition-all"
                      />
                      <button 
                        onClick={handlePromptButton}
                        disabled={promptLoading}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-all active:scale-90"
                        title={config.theme ? "Enhance Prompt" : "Generate Random Theme"}
                      >
                         {promptLoading ? (
                           <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                         ) : (
                           config.theme ? 
                           <span className="text-lg">✨</span> : 
                           <span className="text-lg grayscale hover:grayscale-0 transition-all">🎲</span>
                         )}
                      </button>
                    </div>
                    {/* Validation Error */}
                    {validationError && (
                      <div className="text-red-400 text-xs mt-2 ml-1 animate-pulse">
                        ⚠️ {validationError}
                      </div>
                    )}
                    
                    {/* Dynamic Suggestions */}
                    <div className="flex flex-wrap gap-2 mt-2 min-h-[28px]">
                       {suggestionsLoading ? (
                         <div className="text-xs opacity-50 animate-pulse">Loading creative ideas...</div>
                       ) : (
                         suggestedThemes.map((t, idx) => (
                           <button 
                              key={idx}
                              onClick={() => setConfig({...config, theme: t})}
                              className="text-xs px-3 py-1 rounded-full bg-[var(--border-color)] hover:bg-indigo-500 hover:text-white transition-all opacity-70 hover:opacity-100 animate-fade-in"
                              style={{animationDelay: `${idx * 100}ms`}}
                           >
                              {t}
                           </button>
                         ))
                       )}
                       <button 
                          onClick={loadSuggestions} 
                          className="text-xs px-2 py-1 rounded-full opacity-40 hover:opacity-100 transition-opacity"
                          title="Refresh suggestions"
                       >
                          ↻
                       </button>
                    </div>
                  </div>
                </div>

                {/* Art Style Selector */}
                <div className="mt-8 relative z-10">
                   <div className="flex justify-between items-center mb-3">
                     <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Art Style</label>
                   </div>
                   <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {ART_STYLES.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => setConfig({...config, artStyle: style.id})}
                          className={`relative p-2 h-20 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border group overflow-hidden ${
                            config.artStyle === style.id 
                            ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-md scale-105' 
                            : 'bg-black/5 border-transparent hover:bg-black/10 hover:border-[var(--border-color)]'
                          }`}
                        >
                          <span className={`text-2xl filter drop-shadow-sm transition-all duration-300 ${config.artStyle === style.id ? 'translate-y-[-8px]' : 'group-hover:translate-y-[-8px]'}`}>{style.icon}</span>
                          
                          {/* Name reveals on hover or selected */}
                          <span className={`absolute bottom-1.5 text-[9px] font-bold uppercase tracking-tight transition-all duration-300 ${
                            config.artStyle === style.id 
                              ? 'opacity-100 translate-y-0' 
                              : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                          }`}>
                            {style.name}
                          </span>
                        </button>
                      ))}
                   </div>
                </div>

                {/* Collapsible Advanced */}
                <div className="mt-8 pt-4 border-t border-[var(--border-color)] relative z-10">
                    <button 
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity w-full group"
                    >
                      <span className="group-hover:text-indigo-400 transition-colors">{showAdvanced ? '−' : '+'}</span>
                      <span className="group-hover:text-indigo-400 transition-colors">Advanced Settings</span>
                    </button>
                    
                    {showAdvanced && (
                      <div className="grid sm:grid-cols-2 gap-6 mt-6 animate-fade-in bg-black/5 p-4 rounded-xl">
                        {/* Age Slider */}
                        <div className="col-span-2">
                           <div className="flex justify-between items-center mb-3">
                             <span className="text-xs font-bold opacity-70">Detail Level</span>
                             <span className="text-xs font-mono bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">
                               {config.ageGroup === 'toddler' ? 'Toddler (Simple)' : config.ageGroup === 'expert' ? 'Expert (Complex)' : 'Kids (Standard)'}
                             </span>
                           </div>
                           <input 
                              type="range" 
                              min="0" 
                              max="2" 
                              step="1"
                              value={config.ageGroup === 'toddler' ? 0 : config.ageGroup === 'expert' ? 2 : 1}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setConfig({...config, ageGroup: val === 0 ? 'toddler' : val === 2 ? 'expert' : 'kids'});
                              }}
                              className="w-full"
                           />
                        </div>

                        {/* Page Count */}
                         <div className="space-y-2">
                            <label className="text-xs font-bold opacity-70">Pages</label>
                            <div className="flex items-center gap-3 bg-[var(--border-color)] p-2 rounded-lg">
                               <input 
                                  type="range" min="1" max="15" 
                                  value={config.pageCount}
                                  onChange={(e) => setConfig({...config, pageCount: parseInt(e.target.value)})}
                                  className="flex-1"
                               />
                               <span className="text-sm font-mono w-6 text-center">{config.pageCount}</span>
                            </div>
                         </div>

                         {/* Image Size */}
                         <div className="space-y-2">
                           <label className="text-xs font-bold opacity-70">Resolution</label>
                           <div className="flex gap-2">
                             {['1K', '2K'].map(res => (
                               <button 
                                 key={res}
                                 onClick={() => setConfig({...config, imageSize: res as any})}
                                 className={`flex-1 text-xs py-2 rounded-lg transition-colors border ${
                                   config.imageSize === res 
                                   ? 'bg-indigo-500 text-white border-indigo-500' 
                                   : 'bg-[var(--border-color)] border-transparent hover:bg-black/20'
                                 }`}
                               >
                                 {res}
                               </button>
                             ))}
                           </div>
                         </div>
                      </div>
                    )}
                </div>

                <Button 
                  onClick={startGeneration} 
                  className="w-full mt-8 py-4 text-lg shadow-xl shadow-indigo-500/20 active:scale-[0.98] transition-all relative z-10"
                >
                  Generate Book
                </Button>
            </div>
          </div>
        )}

        {/* ================= LOADING UI ================= */}
        {(appState === AppState.GENERATING_STORY || appState === AppState.GENERATING_IMAGES) && (
          <div className="w-full max-w-4xl animate-slide-up">
             <div className="glass-panel rounded-3xl border border-[var(--border-color)] overflow-hidden shadow-2xl flex flex-col md:flex-row h-[500px]">
                
                {/* Terminal Console */}
                <div className="flex-1 bg-slate-950 p-6 flex flex-col border-r border-[var(--border-color)]">
                   <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-4">
                      <div className="flex gap-1.5">
                         <div className="w-2.5 h-2.5 rounded-full bg-red-500/20"></div>
                         <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20"></div>
                         <div className="w-2.5 h-2.5 rounded-full bg-green-500/20"></div>
                      </div>
                      <span className="ml-auto text-[10px] font-mono text-slate-600 tracking-widest">SYSTEM_ACTIVE</span>
                   </div>
                   <div className="flex-1 overflow-y-auto space-y-3 font-mono text-xs md:text-sm scrollbar-thin pr-2" ref={logContainerRef}>
                      {terminalLogs.map((log, i) => (
                         <div key={i} className="text-slate-400 break-words animate-fade-in">
                            <span className="text-indigo-500 mr-2">➜</span>{log}
                         </div>
                      ))}
                      <div className="animate-pulse text-indigo-400">_</div>
                   </div>
                </div>

                {/* Visualizer */}
                <div className="w-full md:w-80 bg-[var(--card-bg)] p-8 flex flex-col items-center justify-center relative overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-t from-indigo-500/5 to-transparent"></div>
                   <div className="relative z-10 text-center space-y-8">
                      <div className="w-32 h-32 relative mx-auto">
                         <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full animate-spin [animation-duration:3s]"></div>
                         <div className="absolute inset-2 border-4 border-t-indigo-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                         <div className="absolute inset-0 flex items-center justify-center text-4xl animate-pulse-slow">
                            🎨
                         </div>
                      </div>
                      <div>
                         <div className="text-4xl font-bold font-mono tracking-tighter">
                           {Math.round((pages.filter(p => p.status === 'completed').length / config.pageCount) * 100)}%
                         </div>
                         <div className="text-[10px] uppercase tracking-widest opacity-50 mt-2">Processing Assets</div>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 max-w-[180px]">
                         {pages.length > 0 ? pages.map((p, i) => (
                            <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                               p.status === 'completed' ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]' :
                               p.status === 'generating' ? 'bg-indigo-400 animate-pulse' : 
                               'bg-slate-700'
                            }`}></div>
                         )) : (
                            <span className="text-xs opacity-30 animate-pulse">Initializing...</span>
                         )}
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* ================= RESULTS UI ================= */}
        {appState === AppState.COMPLETED && (
          <div className="w-full max-w-6xl space-y-8 animate-slide-up pb-12">
            
            {/* Header Actions */}
            <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6 sticky top-20 z-10 shadow-xl border-indigo-500/20">
               <div className="text-center md:text-left">
                  <h2 className="text-2xl font-bold font-comic text-gradient">{config.theme}</h2>
                  <p className="text-sm opacity-60">Created for {config.childName}</p>
               </div>
               <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={handleUniversalShare} variant="primary" className="text-sm px-6">
                     <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                     Share
                  </Button>
                  <Button onClick={handleTwitterShare} variant="secondary" className="text-sm">
                     <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                     X
                  </Button>
                  <Button onClick={handlePinterestShare} variant="secondary" className="text-sm">
                     <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.399.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.951-7.252 4.173 0 7.41 2.967 7.41 6.923 0 4.133-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.367 18.62 0 12.017 0z"/></svg>
                     Pin
                  </Button>
                  <Button onClick={downloadZip} variant="ghost" className="text-sm">
                     <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                     ZIP
                  </Button>
                  <Button onClick={() => window.print()} variant="ghost" className="text-sm">
                     <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                     PDF
                  </Button>
               </div>
            </div>

            {/* Gallery */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 px-2">
              {/* Cover */}
              <div className="aspect-[3/4] glass-panel rounded-xl flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[var(--border-color)] group hover:border-indigo-500 transition-colors">
                 <h3 className="font-comic text-2xl font-bold mb-2 group-hover:scale-105 transition-transform">{config.theme}</h3>
                 <p className="text-xs uppercase tracking-widest opacity-50">Cover Page</p>
                 <div className="mt-8 text-5xl grayscale group-hover:grayscale-0 transition-all duration-500">📖</div>
              </div>

              {pages.map((page, idx) => (
                <div key={page.id} className="group relative aspect-[3/4] bg-white rounded-xl overflow-hidden shadow-md hover:shadow-2xl hover:scale-[1.02] transition-all duration-300">
                  {page.imageUrl ? (
                    <img src={page.imageUrl} alt={page.sceneDescription} className="w-full h-full object-contain mix-blend-multiply" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-red-400 text-xs">Error</div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                     <p className="text-xs text-black font-medium leading-relaxed">{page.sceneDescription}</p>
                  </div>
                  <div className="absolute top-3 right-3 bg-black/5 text-black/50 px-2 py-1 rounded text-[10px] font-bold">
                     {idx + 1}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center pt-12 pb-8">
               <Button onClick={resetApp} variant="outline" className="px-8 py-3">Create Another Book</Button>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full py-8 text-center text-[var(--text-muted)] text-sm border-t border-[var(--border-color)] bg-[var(--bg-color)]/50 backdrop-blur relative z-10">
        <p className="mb-3 font-medium">Made by <span className="text-indigo-400 font-bold hover:text-indigo-300 transition-colors cursor-default">DragAdi</span></p>
        <div className="flex justify-center gap-6 text-xs font-bold uppercase tracking-widest opacity-60">
          <a href="https://github.com/dragaditya" target="_blank" rel="noopener noreferrer" className="hover:text-white hover:opacity-100 transition-all hover:-translate-y-0.5">GitHub</a>
          <a href="https://linkedin.com/in/dragadi" target="_blank" rel="noopener noreferrer" className="hover:text-white hover:opacity-100 transition-all hover:-translate-y-0.5">LinkedIn</a>
          <a href="https://instagram.com/_dragadi" target="_blank" rel="noopener noreferrer" className="hover:text-white hover:opacity-100 transition-all hover:-translate-y-0.5">Instagram</a>
        </div>
      </footer>

      {/* Chat Widget */}
      {apiKey && <ChatWidget apiKey={apiKey} />}
      
      {/* Hidden Print Component */}
      {appState === AppState.COMPLETED && apiKey && (
        <PrintBook pages={pages} config={config} />
      )}
    </div>
  );
}