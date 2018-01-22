import { CourseBookMongoService } from "./courseBookMongoService";
import { CourseBookService } from "./courseBookService";
export { CourseBook } from "./courseBookModel";

export let courseBookService: CourseBookService = new CourseBookMongoService();
