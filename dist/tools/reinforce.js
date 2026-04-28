/**
 * Memory Reinforce Tool
 * Reinforces a memory by incrementing its access count
 */
export class MemoryReinforceTool {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async execute(input) {
        try {
            // Validate input
            this.validateInput(input);
            // Reinforce memory
            const memory = await this.supabase.reinforceMemory(input.id);
            return {
                success: true,
                memory: {
                    id: memory.id,
                    access_count: memory.access_count,
                    last_accessed_at: memory.last_accessed_at
                },
                message: `Memory reinforced. Access count: ${memory.access_count}`
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                message: 'Failed to reinforce memory'
            };
        }
    }
    validateInput(input) {
        if (!input.id || input.id.trim().length === 0) {
            throw new Error('ID is required and cannot be empty');
        }
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(input.id)) {
            throw new Error('ID must be a valid UUID');
        }
    }
}
//# sourceMappingURL=reinforce.js.map