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
      'The desired performance characteristics (e.g., low latency, high throughput).'
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
  prompt: `You are an expert system administrator. You suggest optimized URL configurations for network instances based on their type and desired performance.

  Given the following instance type and desired performance characteristics, suggest an optimized URL configuration:

  Instance Type: {{{instanceType}}}
  Performance Characteristics: {{{performanceCharacteristics}}}

  The URL configuration should be optimized for the given instance type and performance characteristics. For example, if the instance type is "server" and the performance characteristics are "low latency", the URL configuration might include parameters to reduce latency.

  Please provide only the URL configuration string.
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
    return output!;
  }
);
