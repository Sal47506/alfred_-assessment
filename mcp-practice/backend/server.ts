import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MARKDOWN_GUIDE = "https://www.markdownguide.org/";
const USER_AGENT = "markdown-app/1.0";

const server = new McpServer({
    name: "markdown-converter",
    version: "1.0.0",

})

async function formatToMarkdown<T>(files : {name: any, content: any}[]) : Promise<T[] | null> {

    const headers = {
        "User-Agent": USER_AGENT,
        Accept: "docs/md",
    }

    const results: T[] = [];

    for(const file of files) {

        const result = '# ${file.name}\n' as T;
        results.push(result);
    }

    if (results == null) {
        return null;
    }

    return results;
}

interface MarkDown_Format {
    context: string,
}


async function process_request(files: {content: any}[]) : Promise<MarkDown_Format | null> {
    const newMDFile : MarkDown_Format = {
        context: files.map((result, i) => `File ${i + 1}:\n${result.content}`)
        .join("\n\n"),
    };

    if (!newMDFile) {
        return null;
    }

    return newMDFile;

}


server.registerTool(
    "write_md_file", {
        description: `Write a Readme.MD file based on the file uploads, 
                    output for the README.MD file must follow the markdown file guidelines in ${MARKDOWN_GUIDE}`,
        inputSchema: {
            files: z.array(
                z.object({
                    content: z
                        .string()
                        .describe("contents of the individual file"),
                })
            ).describe("contents of all the files that should be summarized into a README.MD markdown file"),
        },
    },

    async ({files}) => {
        const md_file = await process_request(files);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(md_file),
                }
            ],
        };


    }

);

async function main() {
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
    } catch(error) {
        throw console.error("server failed");
    }
    
}

