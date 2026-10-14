export interface GoalFundingRequirement {
  goalId: string;
  goalName: string;
  priority: number;
  requiredAmount: number;
}

export interface GoalAllocation {
  goalId: string;
  goalName: string;
  priority: number;
  requiredAmount: number;
  allocatedAmount: number;
  shortfall: number;
  fundedFully: boolean;
}

export interface GoalAllocationStrategy {
  allocate(availableAmount: number, requirements: GoalFundingRequirement[]): GoalAllocation[];
}

export class WaterfallAllocationStrategy implements GoalAllocationStrategy {
  allocate(availableAmount: number, requirements: GoalFundingRequirement[]): GoalAllocation[] {
    const sorted = [...requirements].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.goalName.localeCompare(b.goalName);
    });

    let remaining = Math.max(0, availableAmount);
    return sorted.map((requirement) => {
      const allocated = Math.min(remaining, Math.max(0, requirement.requiredAmount));
      remaining -= allocated;
      return {
        goalId: requirement.goalId,
        goalName: requirement.goalName,
        priority: requirement.priority,
        requiredAmount: Number(requirement.requiredAmount.toFixed(2)),
        allocatedAmount: Number(allocated.toFixed(2)),
        shortfall: Number((requirement.requiredAmount - allocated).toFixed(2)),
        fundedFully: allocated >= requirement.requiredAmount - 0.0001,
      };
    });
  }
}

export const waterfallAllocationStrategy = new WaterfallAllocationStrategy();