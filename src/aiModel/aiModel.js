import OpenAI from 'openai';

export const getOpenAIClient = () => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY no está definida');
    }
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY});
};

export const responseAI = async (req, res) => {
    const openai = getOpenAIClient();
    const { prompt } = req.body;
    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        input: prompt
    });

    res.json({ text: response.output[0].content[0].text });
};
