import React, { useState, useEffect, useCallback } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { 
  FileText, Upload, Settings, Play, Download, X, HelpCircle, 
  CheckCircle2, AlertTriangle, FileInput, Plus, Trash2, Search,
  Loader2, Mail, ChevronLeft, ChevronRight
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

  // State for analyzed data
  const [analyzedData, setAnalyzedData] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Analyze files when files or layout changes
  const analyzeFiles = async (filesToAnalyze) => {
    if (!selectedLayout || filesToAnalyze.length === 0) return;
    
    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append("layout_name", selectedLayout);
    filesToAnalyze.forEach(f => formData.append("files", f));
    
    try {
      const res = await axios.post('/api/analyze-pdfs', formData);
      setAnalyzedData(res.data);
    } catch (e) {
      console.error(e);
      alert("解析に失敗しました");
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    // Only auto-analyze if we have files and a layout
    if (files.length > 0 && selectedLayout) {
        analyzeFiles(files);
    } else {
        setAnalyzedData([]);
    }
  }, [files, selectedLayout]);

  const removeFile = (index) => {
    const fileToRemove = files[index];
    setFiles(prev => prev.filter((_, i) => i !== index));
    // Also remove from analyzedData
    setAnalyzedData(prev => prev.filter(item => item.filename !== fileToRemove.name));
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

    // Prepare overrides
    const overrides = {};
    analyzedData.forEach(item => {
        overrides[item.filename] = {
            subject: item.subject,
            body: item.body,
            to_email: item.to_email,
            cc_email: item.cc_email
        };
    });
    formData.append("overrides", JSON.stringify(overrides));

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

  const openEditModal = (index) => {
    const item = analyzedData[index];
    if (item) {
        setEditingItem({ index, ...item });
        setEditModalOpen(true);
    }
  };

  const saveEdit = (newData) => {
    setAnalyzedData(prev => {
        const next = [...prev];
        // Merge changes but item in analyzedData might not be in same order if we filter?
        // Actually analyzedData is same index as files if we refresh entirely?
        // Wait, analyzedData order matches response order. Response order matches files order.
        // So index should match.
        // However, if we remove file, analyzedData filters by filename so ordering might break if duplicate filenames?
        // Assuming unique filenames for now as is typical.
        // Safer to find by filename?
        const targetIndex = next.findIndex(d => d.filename === editingItem.filename);
        if (targetIndex !== -1) {
             next[targetIndex] = { ...next[targetIndex], ...newData };
        }
        return next;
    });
    setEditModalOpen(false);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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

      {/* Upload Area (Top) */}
      <Card className="p-6">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Upload className="w-4 h-4" /> PDFアップロード
          </h3>
          <div 
            {...getRootProps()} 
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors h-32 flex flex-col items-center justify-center gap-3",
              isDragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
            )}
          >
            <input {...getInputProps()} />
            <div className="flex items-center gap-3 text-slate-500">
               <FileText className="w-6 h-6" />
               <span className="font-medium">
                  {isDragActive ? "ドロップして追加" : "クリックまたはドラッグ＆ドロップでPDFを追加"}
               </span>
            </div>
          </div>
        </Card>

      {/* File List & Analysis Result (Bottom) */}
      <Card className="p-6">
         <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" /> 解析結果一覧 ({files.length})
            </div>
            {isAnalyzing && <span className="text-xs text-indigo-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> 解析中...</span>}
          </h3>
          
          <div className="space-y-3 mb-6">
              {files.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">ファイルがありません</p>}
              
              {/* List Header */}
              {files.length > 0 && (
                  <div className="grid grid-cols-12 gap-4 text-xs font-bold text-slate-500 px-4 mb-2">
                       <div className="col-span-3">ファイル名</div>
                       <div className="col-span-3">マッチした設定</div>
                       <div className="col-span-3">宛先</div>
                       <div className="col-span-2">ステータス</div>
                       <div className="col-span-1">操作</div>
                  </div>
              )}

              {files.map((file, idx) => {
                  const analysis = analyzedData.find(d => d.filename === file.name);
                  return (
                      <div key={idx} className="grid grid-cols-12 gap-4 items-center bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm hover:bg-slate-100 transition-colors">
                          <div className="col-span-3 truncate font-medium text-slate-700" title={file.name}>{file.name}</div>
                          
                          <div className="col-span-3 truncate text-slate-600">
                              {analysis ? (
                                  analysis.company_name ? (
                                    <>
                                        <span className="block font-bold text-xs">{analysis.company_name}</span>
                                        <span className="text-xs">{analysis.name} {analysis.honorific}</span>
                                    </>
                                  ) : <span className="text-slate-400">-</span>
                              ) : <span className="text-slate-400 animate-pulse">...</span>}
                          </div>

                          <div className="col-span-3 truncate text-slate-600 text-xs">
                              {analysis ? (
                                  <div className="flex flex-col">
                                      <span title={analysis.to_email}>To: {analysis.to_email || "(未設定)"}</span>
                                      <span title={analysis.cc_email} className="text-slate-400">Cc: {analysis.cc_email}</span>
                                  </div>
                              ) : "-"}
                          </div>

                          <div className="col-span-2">
                              {analysis ? (
                                  analysis.status === "success" ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded-full">
                                          <CheckCircle2 className="w-3 h-3" /> OK
                                      </span>
                                  ) : (
                                      <span className="inline-flex items-center gap-1 text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded-full" title={analysis.error_message}>
                                          <AlertTriangle className="w-3 h-3" /> エラー
                                      </span>
                                  )
                              ) : <span className="text-slate-400 text-xs">待機中</span>}
                          </div>

                          <div className="col-span-1 flex items-center gap-1 justify-end">
                              <button 
                                onClick={() => openEditModal(idx)}
                                disabled={!analysis}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition-colors disabled:opacity-30"
                                title="内容を編集"
                              >
                                  <Settings className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => removeFile(idx)} 
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded transition-colors"
                                title="削除"
                              >
                                <X className="w-4 h-4" />
                              </button>
                          </div>
                      </div>
                  );
              })}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            {generatedUrl ? (
              <a href={generatedUrl} download="drafts.zip" className="block w-64">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Download className="w-4 h-4" />
                  ZIPをダウンロード
                </Button>
              </a>
            ) : (
              <Button onClick={handleGenerate} className="w-64" isLoading={isProcessing}>
                <Play className="w-4 h-4" />
                下書き生成を実行
              </Button>
            )}
          </div>
      </Card>
      
      {/* Edit Modal (Temporary) */}
      <Dialog.Root open={editModalOpen} onOpenChange={setEditModalOpen}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 transition-opacity backdrop-blur-sm" />
            <Dialog.Content className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] bg-white rounded-xl shadow-2xl p-8 w-[90vw] max-w-2xl max-h-[85vh] overflow-y-auto focus:outline-none z-50">
                <Dialog.Title className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 border-b pb-4">
                    <Mail className="w-5 h-5 text-indigo-600" />
                    メール内容の一時編集
                </Dialog.Title>
                
                {editingItem && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">宛先 (To)</label>
                                <input 
                                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingItem.to_email}
                                    onChange={e => setEditingItem({...editingItem, to_email: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">CC</label>
                                <input 
                                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingItem.cc_email}
                                    onChange={e => setEditingItem({...editingItem, cc_email: e.target.value})}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">件名</label>
                            <input 
                                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={editingItem.subject}
                                onChange={e => setEditingItem({...editingItem, subject: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">本文</label>
                            <textarea 
                                className="w-full p-2 border border-slate-300 rounded h-64 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm leading-relaxed"
                                value={editingItem.body}
                                onChange={e => setEditingItem({...editingItem, body: e.target.value})}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <Button variant="ghost" onClick={() => setEditModalOpen(false)}>キャンセル</Button>
                            <Button onClick={() => saveEdit({ 
                                to_email: editingItem.to_email, 
                                cc_email: editingItem.cc_email,
                                subject: editingItem.subject,
                                body: editingItem.body 
                            })}>
                                変更を適用
                            </Button>
                        </div>
                    </div>
                )}
            </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </div>
  );
};

// --- Management Tab ---
const ManagementTab = ({ layouts, refreshLayouts }) => {
  const [activeLayout, setActiveLayout] = useState(layouts[0] || "");
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [layoutSetting, setLayoutSetting] = useState({ layout_name: "", sender_email: "" });
  const [isSavingLayoutSetting, setIsSavingLayoutSetting] = useState(false);
  
  // Modals state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  
  // Selected items state
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  
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

  const fetchLayoutSetting = useCallback(async () => {
    if (!activeLayout) {
      setLayoutSetting({ layout_name: "", sender_email: "" });
      return;
    }

    try {
      const res = await axios.get(`/api/layout-settings/${encodeURIComponent(activeLayout)}`);
      setLayoutSetting(res.data);
    } catch (e) {
      console.error(e);
    }
  }, [activeLayout]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  useEffect(() => {
    fetchLayoutSetting();
  }, [fetchLayoutSetting]);

  const handleEditSave = async (updatedData) => {
      try {
          await axios.put(`/api/configs/${updatedData.id}`, updatedData);
          setEditModalOpen(false);
          fetchConfigs(); // Refresh list
      } catch (error) {
          console.error(error);
          alert("保存に失敗しました");
      }
  };

  const handleDelete = async (id) => {
      if(!window.confirm("この設定を削除してもよろしいですか？")) return;
      try {
          await axios.delete(`/api/configs/${id}`);
          fetchConfigs(); // Refresh list
      } catch (error) {
          console.error(error);
          alert("削除に失敗しました");
      }
  };

      const handleSaveLayoutSetting = async () => {
        if (!activeLayout) return;

        setIsSavingLayoutSetting(true);
        try {
          const res = await axios.put(`/api/layout-settings/${encodeURIComponent(activeLayout)}`, {
            sender_email: layoutSetting.sender_email,
          });
          setLayoutSetting(res.data);
        } catch (error) {
          console.error(error);
          alert(error?.response?.data?.detail || "送信元アドレスの保存に失敗しました");
        } finally {
          setIsSavingLayoutSetting(false);
        }
      };

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
            <Button variant="secondary" onClick={() => {
                const url = activeLayout ? `http://localhost:8000/api/template-csv?layout_name=${encodeURIComponent(activeLayout)}` : 'http://localhost:8000/api/template-csv';
                window.location.href = url;
            }}>
                 <Download className="w-4 h-4" /> CSVダウンロード
            </Button>
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

        <div className="border-b border-slate-200 p-4 bg-white">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex-1 max-w-xl">
              <label className="block text-sm font-medium text-slate-700 mb-1">送信元アドレス</label>
              <input
                value={layoutSetting.sender_email || ""}
                onChange={e => setLayoutSetting(prev => ({ ...prev, sender_email: e.target.value }))}
                placeholder="example@company.co.jp"
                className="w-full border border-slate-300 rounded p-2 text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">現在選択中のレイアウトに対して適用されます。生成される EML の From と Reply-To に使用します。</p>
            </div>
            <Button onClick={handleSaveLayoutSetting} isLoading={isSavingLayoutSetting} className="md:min-w-[180px]">
              <Mail className="w-4 h-4" />
              送信元を保存
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 shadow-sm z-10">
              <tr>
                <th className="p-3 border-b text-xs w-[80px]">操作</th>
                <th className="p-3 border-b">ファイル名</th>
                <th className="p-3 border-b">会社名</th>
                <th className="p-3 border-b">所属</th>
                <th className="p-3 border-b">担当者</th>
                <th className="p-3 border-b">To Email</th>
                <th className="p-3 border-b">CC Email</th>
                <th className="p-3 border-b w-1/3">テンプレート (プレビュー)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                   <td colSpan={8} className="p-8 text-center text-slate-400">Loading...</td>
                </tr>
              ) : data.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1 hover:bg-slate-200 rounded text-slate-600" onClick={() => {
                            setEditingRow(row);
                            setEditModalOpen(true);
                        }} title="編集">
                           <Settings className="w-4 h-4" />
                        </button>
                        <button className="p-1 hover:bg-red-100 rounded text-red-500" onClick={() => handleDelete(row.id)} title="削除">
                           <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-indigo-600">{row.pdf_filename_keyword}</td>
                  <td className="p-3">{row.company_name}</td>
                  <td className="p-3">{row.department}</td>
                  <td className="p-3">
                    {row.name} <span className="text-slate-400 text-xs">{row.honorific}</span>
                  </td>
                  <td className="p-3 text-slate-600 max-w-[150px] truncate" title={row.to_email}>{row.to_email}</td>
                  <td className="p-3 text-slate-600 max-w-[150px] truncate" title={row.cc_email}>{row.cc_email}</td>
                  <td className="p-3 text-slate-500 max-w-xs cursor-pointer hover:bg-indigo-50" onClick={() => {
                        setEditingRow(row);
                        setEditModalOpen(true);
                  }} title="クリックして編集">
                    <div className="line-clamp-2 whitespace-pre-wrap text-xs">
                        {row.body_template}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && data.length === 0 && (
                 <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">データがありません</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal */}
      <Dialog.Root open={editModalOpen} onOpenChange={setEditModalOpen}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 animate-in fade-in" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl bg-white rounded-xl shadow-xl p-6 z-50 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <Dialog.Title className="text-xl font-bold">設定編集</Dialog.Title>
                    
                    {editingRow && (
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-medium text-slate-500">
                                {data.findIndex(r => r.id === editingRow.id) + 1} / {data.length} 件目
                            </span>
                            <div className="flex gap-1">
                                <button 
                                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                    onClick={() => {
                                        const idx = data.findIndex(r => r.id === editingRow.id);
                                        if (idx > 0) setEditingRow(data[idx - 1]);
                                    }}
                                    disabled={data.findIndex(r => r.id === editingRow.id) <= 0}
                                    title="前の行へ"
                                >
                                    <ChevronLeft className="w-5 h-5 text-slate-600" />
                                </button>
                                <button 
                                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                    onClick={() => {
                                        const idx = data.findIndex(r => r.id === editingRow.id);
                                        if (idx < data.length - 1) setEditingRow(data[idx + 1]);
                                    }}
                                    disabled={data.findIndex(r => r.id === editingRow.id) >= data.length - 1}
                                    title="次の行へ"
                                >
                                    <ChevronRight className="w-5 h-5 text-slate-600" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                
                {editingRow && (
                    <form 
                        key={editingRow.id} // Add key to force re-render when row changes
                        onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        const data = Object.fromEntries(formData.entries());
                        handleEditSave({
                            ...editingRow,
                            ...data
                        });
                    }} className="grid grid-cols-2 gap-6">
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">レイアウト名</label>
                                <input name="layout_name" defaultValue={editingRow.layout_name} className="w-full border rounded p-2" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">ファイル名キーワード</label>
                                <input name="pdf_filename_keyword" defaultValue={editingRow.pdf_filename_keyword} className="w-full border rounded p-2" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">会社名</label>
                                <input name="company_name" defaultValue={editingRow.company_name} className="w-full border rounded p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">所属</label>
                                <input name="department" defaultValue={editingRow.department} className="w-full border rounded p-2" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">氏名</label>
                                    <input name="name" defaultValue={editingRow.name} className="w-full border rounded p-2" />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">敬称</label>
                                    <input name="honorific" defaultValue={editingRow.honorific} className="w-full border rounded p-2" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">To Email (カンマ区切り)</label>
                                <input name="to_email" defaultValue={editingRow.to_email} className="w-full border rounded p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">CC Email (カンマ区切り)</label>
                                <input name="cc_email" defaultValue={editingRow.cc_email} className="w-full border rounded p-2" />
                            </div>
                            <div className="h-full flex flex-col">
                                <label className="block text-sm font-medium text-slate-700 mb-1">メール本文テンプレート</label>
                                <textarea name="body_template" defaultValue={editingRow.body_template} className="w-full border rounded p-2 flex-1 min-h-[150px] font-mono text-sm" />
                            </div>
                        </div>

                        <div className="col-span-2 flex justify-end gap-3 pt-4 border-t mt-4">
                            <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>
                                キャンセル
                            </Button>
                            <Button type="submit">
                                保存する
                            </Button>
                        </div>
                    </form>
                )}
            </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
