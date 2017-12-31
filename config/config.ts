/**
 * @author ryeolj5911@gmail.com
 */
import fs = require("fs");
import yaml = require("js-yaml");

class SnuttConfig {
    yamlString:string;
    secretKey:string;
    host:string;
    port:string;
    fcm_api_key:string;
    fcm_project_id:string;
    feedback2github_token:string;
    feedback2github_repo_owner:string;
    feedback2github_repo_name:string;
    mongoUri: string;
    mongoDbName: string;
    mongoTestDbName: string;

    constructor() {
        try {
            this.yamlString = fs.readFileSync(__dirname + '/../snutt.yml', 'utf8');
            let config = yaml.safeLoad(this.yamlString);
            this.secretKey = config.secretKey;
            this.host = config.host;
            this.port = config.port;
            this.fcm_api_key = config.fcm.api_key;
            this.fcm_project_id = config.fcm.project_id;
            this.feedback2github_token = config.feedback2github.token;
            this.feedback2github_repo_name = config.feedback2github.repo_name;
            this.feedback2github_repo_owner = config.feedback2github.repo_owner;
            this.fcm_project_id = config.fcm.project_id;
            this.mongoUri = config.mongo.uri;
            this.mongoDbName = config.mongo.db;
            this.mongoTestDbName = config.mongo.test_db;
        } catch (e) {
            console.error(e.message);
            console.error("Could not find config file.");
            process.exit(1);
        }
        if (process.env.NODE_ENV != "mocha")
            process.env.NODE_ENV = "production";
    }
}

// Singleton
export = new SnuttConfig();
