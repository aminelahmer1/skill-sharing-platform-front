export interface Skill {
  id: number;
  name: string;
  description: string;
  availableQuantity: number;
  price: number;
  nbInscrits: number;
  categoryId: number;
  categoryName?: string;
  categoryDescription?: string;
  userId: number;
  pictureUrl?: string;
  streamingDate: string;
  streamingTime: string;
  createdAt: string;
}



export interface SkillRequest {
  id?: number;
  name: string;
  description: string;
  availableQuantity: number;
  price: number;
  categoryId: number;
  pictureUrl?: string;
  streamingDate: string;
  streamingTime: string;
}

export interface Category {
  id: number;
  name: string;
  description: string;
}