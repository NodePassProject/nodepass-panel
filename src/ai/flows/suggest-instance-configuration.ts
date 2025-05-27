
// use server directive is required for all Genkit flows
'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting optimal instance configurations based on instance type and desired performance characteristics.
 *
 * - suggestInstanceConfiguration - A function that takes instance type and performance characteristics as input and returns a suggested URL configuration.
 * - SuggestInstanceConfigurationInput - The input type for the suggestInstanceConfiguration function.
 * - SuggestInstanceConfigurationOutput - The return type for the suggestInstanceConfiguration function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestInstanceConfigurationInputSchema = z.object({
  instanceType: z.string().describe('The type of the instance (e.g., client, server).'),
  performanceCharacteristics: z
    .string()
    .describe(
      'The desired performance characteristics (e.g., low latency, high throughput, secure connection for gaming).'
    ),
});
export type SuggestInstanceConfigurationInput = z.infer<
  typeof SuggestInstanceConfigurationInputSchema
>;

const SuggestInstanceConfigurationOutputSchema = z.object({
  suggestedUrlConfiguration: z
    .string()
    .describe(
      'The suggested optimized URL configuration based on the instance type and desired performance characteristics.'
    ),
});
export type SuggestInstanceConfigurationOutput = z.infer<
  typeof SuggestInstanceConfigurationOutputSchema
>;

export async function suggestInstanceConfiguration(
  input: SuggestInstanceConfigurationInput
): Promise<SuggestInstanceConfigurationOutput> {
  return suggestInstanceConfigurationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestInstanceConfigurationPrompt',
  input: {schema: SuggestInstanceConfigurationInputSchema},
  output: {schema: SuggestInstanceConfigurationOutputSchema},
  prompt: `You are an expert NodePass system administrator. Your task is to suggest an optimized NodePass instance URL configuration based on the instance type and desired performance characteristics provided by the user.

Refer to the following NodePass usage information to construct the URL:

**NodePass Command-Line Syntax Overview:**
\`nodepass <core>://<tunnel_addr>/<target_addr>?log=<level>&tls=<mode>&crt=<cert_file>&key=<key_file>\`

**Key Parameters:**
- \`<core>\`: \`server\` or \`client\`.
- \`<tunnel_addr>\`: Tunnel endpoint address (e.g., \`ip:port\` or \`hostname:port\`).
- \`<target_addr>\`: Target address for traffic forwarding (e.g., \`ip:port\` or \`hostname:port\`).
- \`log=<level>\`: Log verbosity. Valid levels: \`debug\`, \`info\`, \`warn\`, \`error\`, \`fatal\`. Choose a sensible default if not implied by performance characteristics (e.g., \`info\` for general use, \`debug\` for troubleshooting, \`warn\` or \`error\` for production stability focus).
- \`tls=<mode>\`: (Server mode only) TLS encryption for the data channel.
    - \`0\`: No TLS (plaintext).
    - \`1\`: Self-signed certificate (auto-generated).
    - \`2\`: Custom certificate (requires \`crt\` and \`key\` parameters).
- \`crt=<cert_file>\`: (Server mode, if \`tls=2\`) Path to certificate file. If suggesting \`tls=2\`, use placeholder paths like \`/path/to/your/cert.pem\`.
- \`key=<key_file>\`: (Server mode, if \`tls=2\`) Path to private key file. If suggesting \`tls=2\`, use placeholder paths like \`/path/to/your/key.pem\`.

**Mode-Specific Details:**

**Server Mode:**
\`server://<tunnel_addr>/<target_addr>?log=<level>&tls=<mode>&crt=<cert_file>&key=<key_file>\`
- \`<tunnel_addr>\`: TCP address where the server listens for client control channel connections.
- \`<target_addr>\`: Address the server listens on for incoming TCP/UDP traffic to be tunnelled.
- \`tls\` parameter is applicable.

**Client Mode:**
\`client://<tunnel_addr>/<target_addr>?log=<level>\`
- \`<tunnel_addr>\`: NodePass server's tunnel endpoint address to connect to.
- \`<target_addr>\`: Local address where traffic received from the server will be forwarded.
- \`tls\` parameter is **not** set on the client URL; it inherits TLS policy from the server.

**Your Task:**
Based on the user's input:
- Instance Type: {{{instanceType}}}
- Performance Characteristics: {{{performanceCharacteristics}}}

Suggest a complete and optimized NodePass URL string.
- For \`<tunnel_addr>\` and \`<target_addr>\`, use sensible placeholders like \`0.0.0.0:PORT\`, \`[::]:PORT\`, or \`example.server.com:PORT\` if specific IPs/hostnames are not implied by performance characteristics. You can invent plausible port numbers (e.g., 10101 for tunnel, 8080 for target).
- If \`tls=2\` is suggested for a server, include \`&crt=/path/to/your/cert.pem&key=/path/to/your/key.pem\` as placeholders.
- Prioritize security and performance as indicated. For example:
    - "High security" or "secure file transfer" might imply \`tls=1\` or \`tls=2\` for servers.
    - "Low latency gaming" might imply \`tls=0\` (if on a trusted network and speed is paramount) or \`tls=1\`, and potentially \`log=warn\` or \`log=error\` to reduce overhead.
    - "Easy setup development" might imply \`tls=1\` for servers and \`log=info\` or \`log=debug\`.
- Ensure the generated URL is valid according to the syntax provided. Parameters should be query parameters (e.g. \`?param1=value1&param2=value2\`).

Provide only the complete URL string as your output. Do not add any extra explanations or markdown.

Example for "server" type and "high throughput, secure file transfer":
\`server://0.0.0.0:10101/0.0.0.0:8080?log=info&tls=1\`

Example for "client" type and "connect to production server, stable connection":
\`client://prod.nodepass.server.com:10101/127.0.0.1:8000?log=warn\`
  `,
});

const suggestInstanceConfigurationFlow = ai.defineFlow(
  {
    name: 'suggestInstanceConfigurationFlow',
    inputSchema: SuggestInstanceConfigurationInputSchema,
    outputSchema: SuggestInstanceConfigurationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    // Ensure the output is not null and directly return the string
    if (output && typeof output.suggestedUrlConfiguration === 'string') {
      return { suggestedUrlConfiguration: output.suggestedUrlConfiguration.trim() };
    }
    // Fallback or error handling if the AI doesn't return the expected format
    // For now, returning an empty string or throwing an error might be options.
    // Let's assume the prompt is robust enough for now.
    return output!;
  }
);

