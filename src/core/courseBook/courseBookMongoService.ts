import mongoose = require('mongoose');
import { CourseBook } from './courseBookModel';
import { CourseBookService } from './courseBookService';

var CourseBookSchema = new mongoose.Schema({
  year: { type: Number, required: true },
  semester: { type: Number, required: true },
  updated_at: Date
});

let CourseBookModel = mongoose.model('CourseBook', CourseBookSchema, 'coursebooks');

export class CourseBookMongoService implements CourseBookService {
    getAll(): Promise<CourseBook[]> {
        return <any>CourseBookModel.find({}, '-_id year semester updated_at')
            .sort([["year", -1], ["semester", -1]])
            .exec();
    }

    getRecent(): Promise<CourseBook> {
        return <any>CourseBookModel.findOne({}, '-_id year semester updated_at')
            .sort([["year", -1], ["semester", -1]])
            .exec();
    }

    updateDateOrInsertAndReturnOld(year: number, semester: number): Promise<CourseBook> {
        return <any>CourseBookModel.findOneAndUpdate({ year: year, semester: semester },
            { updated_at: Date.now() },
            {
            new: false,   // return new doc
            upsert: true // insert the document if it does not exist
            })
            .exec();
    }

    async insert(year: number, semester: number): Promise<CourseBook> {
        return <any>new CourseBookModel(
            { year: year, semester: semester, updated_at: Date.now()})
            .save();
    }
}
