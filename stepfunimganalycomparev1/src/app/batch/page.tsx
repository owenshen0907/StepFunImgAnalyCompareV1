// app/batch/page.tsx
'use client';

import { useState, ChangeEvent } from 'react';

interface BatchRowData {
    id: number;
    selectedModel: string; // 单选模型
    streamOutput: boolean;
    sysPrompt: string;
    userPrompt: string;
    imageFile: File | null;
    // 使用 string 保存累加后流式返回的内容
    result: string;
}

const AVAILABLE_MODELS = [
    'step-1v-8k',
    'step-1v-32k',
    'step-1o-vision-32k',
    'gpt-4o'
];

export default function BatchAnalysisPage() {
    // 同步状态：模型、Sys Prompt、User Prompt
    const [syncModel, setSyncModel] = useState(false);
    const [syncSys, setSyncSys] = useState(false);
    const [syncUser, setSyncUser] = useState(false);

    const [rows, setRows] = useState<BatchRowData[]>([
        {
            id: Date.now(),
            selectedModel: '',
            streamOutput: true, // 默认启用流式更新
            sysPrompt: '',
            userPrompt: '',
            imageFile: null,
            result: '',
        },
    ]);

    // 添加新行
    const addRow = () => {
        setRows((prev) => [
            ...prev,
            {
                id: Date.now() + Math.random(),
                selectedModel: syncModel && prev.length > 0 ? prev[0].selectedModel : '',
                streamOutput: true, // 新行也启用流式（如果你希望新行非流式，可调整此处）
                sysPrompt: syncSys && prev.length > 0 ? prev[0].sysPrompt : '',
                userPrompt: syncUser && prev.length > 0 ? prev[0].userPrompt : '',
                imageFile: null,
                result: '',
            },
        ]);
    };

    // 删除某行
    const removeRow = (id: number) => {
        setRows((prev) => prev.filter((row) => row.id !== id));
    };

    // 更新某行数据
    const updateRow = (id: number, field: Partial<BatchRowData>) => {
        setRows((prev) =>
            prev.map((row) => (row.id === id ? { ...row, ...field } : row))
        );
    };

    // 同步更新所有行的模型、Sys Prompt、User Prompt
    const updateAllRowsModel = (model: string) => {
        setRows((prev) => prev.map((row) => ({ ...row, selectedModel: model })));
    };

    const updateAllRowsSysPrompt = (prompt: string) => {
        setRows((prev) => prev.map((row) => ({ ...row, sysPrompt: prompt })));
    };

    const updateAllRowsUserPrompt = (prompt: string) => {
        setRows((prev) => prev.map((row) => ({ ...row, userPrompt: prompt })));
    };

    // 将上传图片转换为 base64 字符串
    const getImagePreview = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error('无法读取文件'));
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
        });

    // 针对单行请求封装的函数
    const sendRequest = async (row: BatchRowData) => {
        // 每次请求前先清空结果
        updateRow(row.id, { result: '' });

        let base64Image = '';
        if (row.imageFile) {
            const preview = await getImagePreview(row.imageFile);
            base64Image = preview.split(',')[1];
        }

        try {
            const resp = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: row.selectedModel,
                    sys_prompt: row.sysPrompt,
                    user_prompt: row.userPrompt,
                    base64Image,
                    stream: row.streamOutput, // 根据行内配置是否启用流式
                }),
            });

            // 如果启用流式且返回了流
            if (row.streamOutput && resp.body) {
                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let accumulated = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    // 示例：假设每个 chunk 以 "data: " 开头，后面接 JSON 数据
                    // 如果 chunk 内可能有多行，则可以按换行符分割处理
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        // 去掉前缀 "data:"（如果存在）
                        const trimmed = line.startsWith('data:') ? line.substring(5).trim() : line.trim();
                        try {
                            const parsed = JSON.parse(trimmed);
                            // 假设有效的内容在 parsed.choices[0].delta.content 中
                            const content = parsed.choices?.[0]?.delta?.content || '';
                            accumulated += content;
                        } catch (err) {
                            // 如果 JSON 解析失败，则直接累加原始文本，或视情况忽略
                            accumulated += trimmed;
                        }
                    }
                    updateRow(row.id, { result: accumulated });
                }
            } else {
                // 非流式模式：直接处理完整响应
                const data = await resp.json();
                let finalResult = '';
                if (data.error) {
                    finalResult = `错误: ${data.error}`;
                } else if (data.choices && data.choices.length > 0) {
                    finalResult = data.choices[0].message.content;
                } else if (data.data) {
                    finalResult = data.data;
                } else {
                    finalResult = JSON.stringify(data);
                }
                updateRow(row.id, { result: finalResult });
            }
        } catch (err: any) {
            updateRow(row.id, { result: `请求异常: ${err.message}` });
        }
    };

    // 批量执行，多行请求全部并发发起
    const handleBatchSubmit = async () => {
        // 检查必填项：每行必须选择模型
        for (const row of rows) {
            if (!row.selectedModel) {
                alert('请选择模型（单选）！');
                return;
            }
        }

        // 使用 Promise.all 并行发起每一行请求
        await Promise.all(rows.map((row) => sendRequest(row)));
    };

    // 处理文件上传事件
    const handleFileChange = (e: ChangeEvent<HTMLInputElement>, id: number) => {
        if (e.target.files && e.target.files.length > 0) {
            updateRow(id, { imageFile: e.target.files[0] });
        }
    };

    return (
        <main className="p-8 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold text-center mb-8">批量分析</h1>

            <div className="flex justify-center mb-6 space-x-4">
                <button
                    onClick={addRow}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded shadow"
                >
                    添加一行
                </button>
                <button
                    onClick={handleBatchSubmit}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
                >
                    开始执行
                </button>
            </div>

            {/* 表格 */}
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-300">
                    <thead className="bg-gray-200">
                    <tr>
                        <th className="py-3 px-4 border-r border-gray-300">序号</th>
                        <th className="py-3 px-4 border-r border-gray-300">
                            <div className="flex flex-col">
                  <span>
                    模型 <span className="text-red-500">*</span>
                  </span>
                                <label className="text-sm">
                                    <input
                                        type="checkbox"
                                        checked={syncModel}
                                        onChange={(e) => setSyncModel(e.target.checked)}
                                        className="mr-1"
                                    />
                                    同步所有行
                                </label>
                            </div>
                        </th>
                        <th className="py-3 px-4 border-r border-gray-300">
                            <div className="flex flex-col">
                                <span>Sys Prompt</span>
                                <label className="text-sm">
                                    <input
                                        type="checkbox"
                                        checked={syncSys}
                                        onChange={(e) => setSyncSys(e.target.checked)}
                                        className="mr-1"
                                    />
                                    同步所有行
                                </label>
                            </div>
                        </th>
                        <th className="py-3 px-4 border-r border-gray-300">上传图片</th>
                        <th className="py-3 px-4 border-r border-gray-300">
                            <div className="flex flex-col">
                                <span>User Prompt</span>
                                <label className="text-sm">
                                    <input
                                        type="checkbox"
                                        checked={syncUser}
                                        onChange={(e) => setSyncUser(e.target.checked)}
                                        className="mr-1"
                                    />
                                    同步所有行
                                </label>
                            </div>
                        </th>
                        <th className="py-3 px-4">结果</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((row, index) => (
                        <tr key={row.id} className="even:bg-gray-50">
                            {/* 序号 */}
                            <td className="py-4 px-4 text-center border-r border-gray-300">
                                {index + 1}
                            </td>
                            {/* 模型选择 */}
                            <td className="py-4 px-4 border-r border-gray-300">
                                <select
                                    value={row.selectedModel}
                                    onChange={(e) => {
                                        const newVal = e.target.value;
                                        if (syncModel) {
                                            updateAllRowsModel(newVal);
                                        } else {
                                            updateRow(row.id, { selectedModel: newVal });
                                        }
                                    }}
                                    className="w-full border border-gray-300 rounded p-2 focus:outline-none focus:ring focus:border-blue-300"
                                >
                                    <option value="" disabled>
                                        请选择模型
                                    </option>
                                    {AVAILABLE_MODELS.map((m) => (
                                        <option key={m} value={m}>
                                            {m}
                                        </option>
                                    ))}
                                </select>
                            </td>
                            {/* Sys Prompt */}
                            <td className="py-4 px-4 border-r border-gray-300">
                  <textarea
                      rows={3}
                      value={row.sysPrompt}
                      onChange={(e) => {
                          const newVal = e.target.value;
                          if (syncSys) {
                              updateAllRowsSysPrompt(newVal);
                          } else {
                              updateRow(row.id, { sysPrompt: newVal });
                          }
                      }}
                      className="w-full border border-gray-300 rounded p-2 focus:outline-none focus:ring focus:border-blue-300"
                  />
                            </td>
                            {/* 上传图片 */}
                            <td className="py-4 px-4 border-r border-gray-300">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleFileChange(e, row.id)}
                                    className="mb-2"
                                />
                                {row.imageFile && (
                                    <img
                                        src={URL.createObjectURL(row.imageFile)}
                                        alt="预览图片"
                                        className="mt-2 max-h-20 object-contain border border-gray-300 rounded"
                                    />
                                )}
                            </td>
                            {/* User Prompt */}
                            <td className="py-4 px-4 border-r border-gray-300">
                  <textarea
                      rows={3}
                      value={row.userPrompt}
                      onChange={(e) => {
                          const newVal = e.target.value;
                          if (syncUser) {
                              updateAllRowsUserPrompt(newVal);
                          } else {
                              updateRow(row.id, { userPrompt: newVal });
                          }
                      }}
                      className="w-full border border-gray-300 rounded p-2 focus:outline-none focus:ring focus:border-blue-300"
                  />
                            </td>
                            {/* 结果及操作 */}
                            <td className="py-4 px-4">
                                {row.result ? (
                                    <div className="p-2 border border-gray-200 rounded bg-gray-100 max-h-36 overflow-auto whitespace-pre-wrap text-sm">
                                        {row.result}
                                    </div>
                                ) : (
                                    <div className="p-2 border border-dashed border-gray-300 rounded text-gray-400 text-sm">
                                        执行后显示结果
                                    </div>
                                )}
                                <button
                                    onClick={() => removeRow(row.id)}
                                    className="mt-2 block text-red-500 hover:underline text-xs"
                                >
                                    删除
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </main>
    );
}