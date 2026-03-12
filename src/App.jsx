import React, { useState, useEffect, useCallback } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { 
  FileText, Upload, Settings, Play, Download, X, HelpCircle, 
  CheckCircle2, AlertTriangle, FileInput, Plus, Trash2, Search,
  Loader2, Mail
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility Functions ---
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- Components (Inline for single file request, but cleanly separated) ---

const Card = ({ children, className }) => (
  <div className={cn("bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden", className)}>
    {children}
  </div>
);

const Button = ({ children, variant = "primary", className, isLoading, ...props }) => {
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200",
    secondary: "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-500 hover:text-slate-700 hover:bg-slate-100 border-transparent",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border-red-200"
  };
  
  return (
    <button 
      className={cn(
        "font-bold py-2 px-6 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

const Navbar = () => (
  <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10 w-full mb-8">
    <div className="flex items-center gap-2">
      <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
        <Mail className="w-5 h-5" />
      </div>
      <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-indigo-500">
        PDF to Draft
      </span>
    </div>
  </nav>
);

// --- Execution Tab ---
const ExecutionTab = ({ layouts }) => {
  const [selectedLayout, setSelectedLayout] = useState("");
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);

  const onDrop = useCallback(acceptedFiles => {
    setFiles(prev => [...prev, ...acceptedFiles]);
    setGeneratedUrl(null); // Reset previous result
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/pdf': ['.pdf'] } 
  });

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!selectedLayout) {
      alert("レイアウトを選択してください");
      return;
    }
    if (files.length === 0) {
      alert("PDFファイルをアップロードしてください");
      return;
    }

    setIsProcessing(true);
    const formData = new FormData();
    formData.append("layout_name", selectedLayout);
    files.forEach(file => {
      formData.append("files", file);
    });

    try {
      const response = await axios.post('/api/generate-drafts', formData, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      setGeneratedUrl(url);
    } catch (error) {
      console.error("Error generating drafts", error);
      alert("生成中にエラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          設定選択
        </h2>
        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium text-slate-700">適用レイアウト:</label>
          <select 
            className="border border-slate-300 rounded-md p-2 min-w-[200px] focus:ring-2 focus:ring-indigo-500 outline-none"
            value={selectedLayout}
            onChange={e => setSelectedLayout(e.target.value)}
          >
            <option value="">選択してください</option>
            {layouts.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Drop Zone */}
        <Card className="p-6">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Upload className="w-4 h-4" /> PDFアップロード
          </h3>
          <div 
            {...getRootProps()} 
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors h-64 flex flex-col items-center justify-center gap-3",
              isDragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
            )}
          >
            <input {...getInputProps()} />
            <div className="bg-slate-100 p-4 rounded-full text-slate-500">
              <FileText className="w-8 h-8" />
            </div>
            {isDragActive ? (
              <p className="text-indigo-600 font-medium">ドロップして追加</p>
            ) : (
              <div className="space-y-1">
                <p className="text-slate-700 font-medium">クリックまたはドラッグ＆ドロップ</p>
                <p className="text-xs text-slate-400">PDFファイルのみ (.pdf)</p>
              </div>
            )}
          </div>
        </Card>

        {/* File List & Action */}
        <Card className="p-6 flex flex-col h-full">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" /> 対象ファイル ({files.length})
          </h3>
          <div className="flex-1 overflow-y-auto max-h-[220px] bg-slate-50 rounded-lg p-2 space-y-2 mb-4">
            {files.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">ファイルがありません</p>}
            {files.map((file, idx) => (
              <div key={idx} className="bg-white p-3 rounded border border-slate-200 flex justify-between items-center text-sm shadow-sm">
                <span className="truncate max-w-[200px] text-slate-700">{file.name}</span>
                <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          
          <div className="mt-auto space-y-3">
            {generatedUrl ? (
              <a href={generatedUrl} download="drafts.zip" className="block">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Download className="w-4 h-4" />
                  ZIPをダウンロード
                </Button>
              </a>
            ) : (
              <Button onClick={handleGenerate} className="w-full" isLoading={isProcessing}>
                <Play className="w-4 h-4" />
                下書き生成を実行
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

// --- Management Tab ---
const ManagementTab = ({ layouts, refreshLayouts }) => {
  const [activeLayout, setActiveLayout] = useState(layouts[0] || "");
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLogs, setImportLogs] = useState(null);

  const fetchConfigs = useCallback(async () => {
    if (!activeLayout) return;
    setIsLoading(true);
    try {
      const res = await axios.get('/api/configs', { params: { layout_name: activeLayout } });
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [activeLayout]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post('/api/import-csv', formData);
      setImportLogs(res.data);
      if (res.data.success) {
        refreshLayouts();
        fetchConfigs();
      }
    } catch (error) {
      console.error(error);
      alert("インポートに失敗しました");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">マスタ管理</h2>
        <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImportModalOpen(true)}>
                <Upload className="w-4 h-4" /> CSVインポート
            </Button>
        </div>
      </div>

      <Card className="min-h-[500px] flex flex-col">
        {/* Toolbar */}
        <div className="border-b border-slate-200 p-4 flex gap-4 items-center bg-slate-50">
          <label className="text-sm font-medium text-slate-600">表示レイアウト:</label>
          <select 
             className="border border-slate-300 rounded p-1.5 text-sm min-w-[150px]"
             value={activeLayout}
             onChange={e => setActiveLayout(e.target.value)}
          >
            {layouts.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="text-xs text-slate-400 ml-auto">{data.length} 件のデータ</span>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 shadow-sm">
              <tr>
                <th className="p-3 border-b">Keyword</th>
                <th className="p-3 border-b">会社名</th>
                <th className="p-3 border-b">担当者</th>
                <th className="p-3 border-b">To Email</th>
                <th className="p-3 border-b w-1/3">テンプレート (プレビュー)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                   <td colSpan={5} className="p-8 text-center text-slate-400">Loading...</td>
                </tr>
              ) : data.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono text-indigo-600">{row.pdf_filename_keyword}</td>
                  <td className="p-3">{row.company_name}</td>
                  <td className="p-3">
                    {row.name} <span className="text-slate-400 text-xs">{row.honorific}</span>
                  </td>
                  <td className="p-3 text-slate-600">{row.to_email}</td>
                  <td className="p-3 text-slate-500 truncate max-w-xs" title={row.body_template}>
                    {row.body_template}
                  </td>
                </tr>
              ))}
              {!isLoading && data.length === 0 && (
                 <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">データがありません</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Import Modal */}
      <Dialog.Root open={importModalOpen} onOpenChange={setImportModalOpen}>
        <Dialog.Portal>
           <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20" />
           <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6 z-30 focus:outline-none">
             <Dialog.Title className="text-lg font-bold text-slate-900 mb-2">CSVインポート</Dialog.Title>
             <Dialog.Description className="text-sm text-slate-500 mb-4">
                 以下のヘッダーが必要です:<br/>
                 <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">layout_name, pdf_filename_keyword, company_name, department, name, honorific, to_email, cc_email, body_template</code>
             </Dialog.Description>
             
             {!importLogs ? (
                 <div className="space-y-4">
                    <input 
                        type="file" 
                        accept=".csv"
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                        onChange={handleImport}
                    />
                 </div>
             ) : (
                <div className="space-y-4">
                    <div className={cn("p-4 rounded-lg", importLogs.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                        {importLogs.success ? (
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5"/>
                                <span>{importLogs.total_processed} 件を処理しました</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5"/>
                                <span>インポートに失敗しました</span>
                            </div>
                        )}
                    </div>
                    
                    {importLogs.errors.length > 0 && (
                        <div className="max-h-[200px] overflow-y-auto bg-slate-50 p-2 rounded text-xs space-y-1 border border-slate-200">
                            {importLogs.errors.map((err, i) => (
                                <div key={i} className="text-red-600">
                                    Line {err.line}: {err.error} <span className="text-slate-400">({err.value})</span>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <div className="flex justify-end">
                        <Button onClick={() => { setImportLogs(null); setImportModalOpen(false); }}>閉じる</Button>
                    </div>
                </div>
             )}
           </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};


// --- App Main ---
function App() {
  const [activeTab, setActiveTab] = useState("execution");
  const [layouts, setLayouts] = useState([]);

  const fetchLayouts = useCallback(async () => {
    try {
      const res = await axios.get('/api/layouts');
      setLayouts(res.data);
    } catch (e) {
      console.error("Failed to fetch layouts", e);
    }
  }, []);

  useEffect(() => {
    fetchLayouts();
  }, [fetchLayouts]);

  return (
    <div className="min-h-screen pb-20">
      <Navbar />
      
      <main className="container mx-auto px-4">
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="w-full">
          <Tabs.List className="flex border-b border-slate-200 mb-8 w-full max-w-4xl mx-auto">
            <Tabs.Trigger 
              value="execution"
              className={cn(
                "flex-1 pb-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 flex items-center justify-center gap-2 outline-none",
                activeTab === "execution" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              <Play className="w-4 h-4" /> 実行 (Execution)
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="management"
              className={cn(
                "flex-1 pb-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 flex items-center justify-center gap-2 outline-none",
                activeTab === "management" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              <Settings className="w-4 h-4" /> 管理 (Management)
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="execution" className="outline-none animate-in fade-in zoom-in-95 duration-300">
            <ExecutionTab layouts={layouts} />
          </Tabs.Content>
          
          <Tabs.Content value="management" className="outline-none animate-in fade-in zoom-in-95 duration-300">
            <ManagementTab layouts={layouts} refreshLayouts={fetchLayouts} />
          </Tabs.Content>
        </Tabs.Root>
      </main>
    </div>
  );
}

export default App;
