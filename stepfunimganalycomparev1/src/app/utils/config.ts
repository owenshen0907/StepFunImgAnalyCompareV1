// app/utils/config.ts

export function getApiConfig(modelName: string) {
    // 如果模型以 step- 开头，则走 StepFun 接口
    if (modelName.startsWith('step-')) {
        return {
            key: process.env.STEP_API_KEY,
            url: process.env.STEP_API_URL,
        };
    }

    // 如果模型是 gpt-4o，则走 OpenAI 接口
    if (modelName === 'gpt-4o') {
        return {
            key: process.env.OPENAI_API_KEY,
            url: process.env.OPENAI_API_URL,
        };
    }

    throw new Error(`不支持的模型名称: ${modelName}`);
}