var MySQL = require('mysql');

global.config = require("./config");

var mysql = MySQL.createConnection(global.config.mysql);

(function init(){
    mysql.connect();
    switch(process.argv[2]){
        case 'inviteFirst':
            mysql.beginTransaction(function(err) {
                if (err) throw err;
                mysql.query('insert into lobby (name, password) values (\'\', \'\')', function(error, results, fields){
                    if(error) throw error;
                    mysql.query('insert into lobby_user (lobby_id, user_id) values (LAST_INSERT_ID(), 1)', function(error, results, fields){
                        if(error) throw error;
                        mysql.commit(function(err) {
                            if (err) throw err;
                            console.log('User #1 invited');
                            mysql.end();
                        });
                    });
                });
            });
            break;
        case 'inviteSecond':
            mysql.beginTransaction(function(err) {
                if (err) throw err;
                mysql.query('insert into lobby (name, password) values (\'\', \'\')', function(error, results, fields){
                    if(error) throw error;
                    mysql.query('insert into lobby_user (lobby_id, user_id) values (LAST_INSERT_ID(), 2)', function(error, results, fields){
                        if(error) throw error;
                        mysql.commit(function(err) {
                            if (err) throw err;
                            console.log('User #2 invited');
                            mysql.end();
                        });
                    });
                });
            });
            break;
        case 'inviteBoth':
            mysql.beginTransaction(function(err) {
                if (err) throw err;
                mysql.query('insert into lobby (name, password) values (\'\', \'\')', function(error, results, fields){
                    if(error) throw error;
                    mysql.query('insert into lobby_user (lobby_id, user_id) values (LAST_INSERT_ID(), 1), (LAST_INSERT_ID(), 2)', function(error, results, fields){
                        if(error) throw error;
                        mysql.commit(function(err) {
                            if (err) throw err;
                            console.log('Both users invited');
                            mysql.end();
                        });
                    });
                });
            });
            break;
        default:
            break;
    }
})();