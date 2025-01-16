// app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiConfig } from '@/app/utils/config';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { model, sys_prompt, user_prompt, base64Image, stream } = body as {
            model: string;
            sys_prompt?: string;
            user_prompt?: string;
            base64Image?: string;
            stream?: boolean;
        };

        const { key, url } = getApiConfig(model);

        // 1) 系统内容
        const systemContent = sys_prompt || '你是一个强大的 AI 助手，专注于描述和分析图像。';

        // 2) 构造 user 内容数组
        const userContent: any[] = [];
        if (user_prompt) {
            userContent.push({
                type: 'text',
                text: user_prompt,
            });
        }
        if (base64Image) {
            userContent.push({
                type: 'image_url',
                image_url: {
                    url: `data:image/png;base64,${base64Image}`,
                    detail: 'high',
                },
            });
        }

        // 3) 组合 messages
        const messages = [
            {
                role: 'system',
                content: systemContent,
            },
            {
                role: 'user',
                content: userContent,
            },
        ];

        // 请求远端 API
        const remoteResponse = await fetch(`${url}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                stream,
            }),
        });

        if (!remoteResponse.ok) {
            const errorText = await remoteResponse.text();
            return NextResponse.json({ error: errorText }, { status: remoteResponse.status });
        }

        // 流式处理：将远端返回的流数据直接转发给前端
        if (stream && remoteResponse.body) {
            const streamData = new ReadableStream({
                async start(controller) {
                    const reader = remoteResponse.body.getReader();
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            controller.enqueue(value);
                        }
                    } catch (err) {
                        console.error('读取流时出错', err);
                        controller.error(err);
                    }
                    controller.close();
                },
            });

            return new NextResponse(streamData, {
                headers: { 'Content-Type': 'text/plain' },
            });
        } else {
            // 非流式处理时返回 JSON
            const jsonData = await remoteResponse.json();
            return NextResponse.json(jsonData);
        }
    } catch (err: any) {
        console.error('API analyze error:', err);
        return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
    }
}