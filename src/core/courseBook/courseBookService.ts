import { CourseBook } from "./courseBookModel";

export interface CourseBookService {
    getAll(): Promise<CourseBook[]>;
    getRecent(): Promise<CourseBook>;
    updateDateOrInsertAndReturnOld(year: number, semester: number): Promise<CourseBook>;
    insert(year: number, semester: number): Promise<CourseBook>;
}
