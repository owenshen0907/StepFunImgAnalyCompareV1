// app/single/page.tsx
'use client';
// 注意：因为我们在此用到了浏览器端的事件和状态，要加 'use client'

import { useState } from 'react';

const AVAILABLE_MODELS = [
    'step-1v-8k',
    'step-1v-32k',
    'step-1o-vision-32k',
    'gpt-4o'
];

export default function SingleAnalysisPage() {
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [streamOutput, setStreamOutput] = useState(false);
    const [sysPrompt, setSysPrompt] = useState('');
    const [userPrompt, setUserPrompt] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [results, setResults] = useState<Record<string, string>>({});

    const handleModelChange = (model: string) => {
        setSelectedModels(prev => {
            if (prev.includes(model)) {
                return prev.filter(m => m !== model);
            }
            return [...prev, model];
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setImageFile(e.target.files[0]);
        }
    };

    const handleSubmit = async () => {
        const newResults: Record<string, string> = {};

        for (const model of selectedModels) {
            // 先把图片转 base64
            let base64Image = '';
            if (imageFile) {
                const reader = new FileReader();
                base64Image = await new Promise<string>((resolve, reject) => {
                    reader.onload = () => {
                        if (typeof reader.result === 'string') {
                            resolve(reader.result.split(',')[1]); // 去掉 'data:image/xxx;base64,' 前缀
                        } else {
                            reject(new Error('无法读取文件'));
                        }
                    };
                    reader.onerror = (err) => reject(err);
                    reader.readAsDataURL(imageFile);
                });
            }

            try {
                const resp = await fetch('/api/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model,
                        sys_prompt: sysPrompt,
                        user_prompt: userPrompt,
                        base64Image,
                        stream: streamOutput,
                    })
                });
                const data = await resp.json();

                if (data.error) {
                    newResults[model] = `错误：${data.error}`;
                } else {
                    if (data.choices && data.choices.length > 0) {
                        newResults[model] = data.choices[0].message.content;
                    } else if (data.data) {
                        newResults[model] = data.data;
                    } else {
                        newResults[model] = JSON.stringify(data);
                    }
                }
            } catch (e: any) {
                newResults[model] = `请求异常：${e.message}`;
            }
        }

        setResults(newResults);
    };

    return (
        <main className="p-4">
            <h1 className="text-xl font-bold mb-4">单用例分析</h1>

            {/* 模型多选、流式 */}
            <div className="flex gap-4 mb-4">
                <div>
                    <label>模型(多选):</label><br/>
                    {AVAILABLE_MODELS.map((m) => (
                        <label key={m} className="mr-3">
                            <input
                                type="checkbox"
                                checked={selectedModels.includes(m)}
                                onChange={() => handleModelChange(m)}
                            />
                            {m}
                        </label>
                    ))}
                </div>
                <div>
                    <label>流式输出:</label><br/>
                    <select
                        value={streamOutput ? 'yes' : 'no'}
                        onChange={(e) => setStreamOutput(e.target.value === 'yes')}
                    >
                        <option value="yes">是</option>
                        <option value="no">否</option>
                    </select>
                </div>
            </div>

            {/* sys_prompt, 上传图片, user_prompt */}
            <div className="flex gap-4 mb-4">
                <div className="flex-1">
                    <label>Sys Prompt:</label><br/>
                    <textarea
                        className="w-full border p-1"
                        rows={4}
                        value={sysPrompt}
                        onChange={(e) => setSysPrompt(e.target.value)}
                    />
                </div>
                <div className="flex-1">
                    <label>上传图片:</label><br/>
                    <input type="file" accept="image/*" onChange={handleFileChange} />
                    {imageFile && <p className="text-sm text-gray-500">已选: {imageFile.name}</p>}
                </div>
                <div className="flex-1">
                    <label>User Prompt:</label><br/>
                    <textarea
                        className="w-full border p-1"
                        rows={4}
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                    />
                </div>
            </div>

            <button
                onClick={handleSubmit}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
                开始分析
            </button>

            {/* 输出结果 */}
            <div className="mt-4">
                {Object.entries(results).map(([model, content]) => (
                    <div key={model} className="mb-4 border-b pb-2">
                        <h3 className="font-semibold">模型: {model}</h3>
                        <pre className="whitespace-pre-wrap text-sm">{content}</pre>
                    </div>
                ))}
            </div>
        </main>
    );
}