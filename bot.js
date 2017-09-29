var steam = require("steam"),
    util = require("util"),
    fs = require("fs"),
    crypto = require("crypto"),
    dota2 = require("dota2"),
    MySQLEvents = require('mysql-events'),
    MySQL = require('mysql'),
    bots = [];

// Load config
global.config = (fs.existsSync("./local.config.js")) ? require("./local.config") : require("./config");

var mysql = MySQL.createConnection(global.config.mysql),
    mysqlEventWatcher = MySQLEvents(global.config.mysql);

// Select free bot from bot array
var selectFreeBot = function(cb){
    if(bots.length > 0){
        for(var i = 0; i < bots.length; i++){
            if(bots[i].free){
                cb(bots[i]);
                return true;
            }
        }
        util.log('All bots busy. Waiting for free bot..');
        setTimeout(function(){
            selectFreeBot(cb);
        }, 10000);
    } else {
        util.log('List of bots empty');
        return false;
    }
};

// Bot initialization with config
var initBot = function(cfg){
    var bot = {
        id: cfg.id,
        config: {
            steam_name: cfg.steam_name,
            steam_user: cfg.steam_user,
            steam_pass: cfg.steam_pass,
            steam_guard_code: cfg.steam_guard_code,
            two_factor_code: cfg.two_factor_code
        },
        currentLobby: {
            id: null
        },
        free: true
    };


    bot.steamClient = new steam.SteamClient();
    bot.steamUser = new steam.SteamUser(bot.steamClient);
    bot.Dota2 = new dota2.Dota2Client(bot.steamClient, true);

    // Login, only passing authCode if it exists
    var logOnDetails = {
        "account_name": bot.config.steam_user,
        "password": bot.config.steam_pass
    };
    if (bot.config.steam_guard_code)
        logOnDetails.auth_code = bot.config.steam_guard_code;
    if (bot.config.two_factor_code)
        logOnDetails.two_factor_code = bot.config.two_factor_code;

    try {
        var sentry = fs.readFileSync('sentry');
        if (sentry.length)
            logOnDetails.sha_sentryfile = sentry;
    } catch (beef) {
        util.log('[Bot #' + bot.id + '] ' + "Cannae load the sentry. " + beef);
    }

    // Steam client handlers
    bot.steamClient.on('connected', function() {
        util.log('[Bot #' + bot.id + '] ' + 'Steam connected');
        bot.steamUser.logOn(logOnDetails);
    });

    bot.steamClient.on('logOnResponse', function (logonResp){
        if (logonResp.eresult == steam.EResult.OK) {
            util.log('[Bot #' + bot.id + '] ' + "Logged on");
            bot.Dota2.launch();
            bot.Dota2.on("ready", function() {
                console.log('[Bot #' + bot.id + '] ' + "Node-dota2 ready");
                var enoughPeople = false,
                    starting = false;
                var start = function () {
                    starting = true;
                    var remainingSeconds = global.config.remaining_before_match;
                    (function tick() {
                        if (enoughPeople) {
                            if (remainingSeconds > 0) {
                                util.log('[Bot #' + bot.id + '] ' + "Starting in " + remainingSeconds + " seconds");
                                setTimeout(tick, 1000);
                                remainingSeconds--;
                            } else {
                                // Launch lobby match
                                bot.Dota2.launchPracticeLobby(function (err, data) {
                                    util.log('[Bot #' + bot.id + '] ' + 'Game started');

                                    // Save status 'game started' to database
                                    mysql.query('update lobby set status = 1 ' +
                                                'where id = ' + bot.currentLobby.id, function(err, res){
                                        if(err) throw err;

                                        // Leave lobby when match started
                                        bot.Dota2.leavePracticeLobby(function (err, body) {
                                            bot.free = true;
                                            bot.currentLobby.id = null;
                                            util.log('[Bot #' + bot.id + '] ' + 'Bot leaved');
                                            //bot.Dota2.abandonCurrentGame();
                                        });
                                    });
                                });
                            }
                        } else {
                            starting = false;
                            util.log('[Bot #' + bot.id + '] ' + "Aborting start: someone left");
                        }
                    })();
                };

                // Update lobby event handler
                bot.Dota2.on("practiceLobbyUpdate", function(lobby) {
                    enoughPeople = (lobby.members.filter(function(e){return e.team === 0 || e.team === 1}).length >= global.config.match_users);
                    if(enoughPeople && !starting) {
                        start();
                    }
                });
            });
            bot.Dota2.on("unready", function () {
                console.log('[Bot #' + bot.id + '] ' + "Node-dota2 unready.");
            });
        }
    });

    bot.steamClient.on('loggedOff', function (eresult){
        util.log('[Bot #' + bot.id + '] ' + "Logged off from Steam");
    });

    bot.steamClient.on('error', function (error){
        util.log('[Bot #' + bot.id + '] ' + "Connection closed by server: " + error);
        //bot.steamClient.connect();
    });

    bot.steamClient.on('servers', function (servers){
        util.log('[Bot #' + bot.id + '] ' + "Received servers");
        fs.writeFile('servers', JSON.stringify(servers), function(err){
            if (err){
                if (this.debug)
                    util.log('[Bot #' + bot.id + '] ' + "Error writing ");
            } else {
                if (this.debug)
                    util.log("");
            }
        });
    });

    bot.steamUser.on('updateMachineAuth', function(sentry, callback) {
        var hashedSentry = crypto.createHash('sha1').update(sentry.bytes).digest();
        fs.writeFileSync('sentry', hashedSentry);
        util.log('[Bot #' + bot.id + '] ' + "sentryfile saved");
        callback({
            sha_file: hashedSentry
        });
    });

    // Connect to Steam
    bot.steamClient.connect();

    // Add bot to array
    bots.push(bot);
};

// Start database watcher
var startDBWatcher = function(){
    util.log('Init database watcher');

    // Create database watcher for table 'lobby'
    mysqlEventWatcher.add(global.config.mysql.database + '.lobby', function (oldRow, newRow, event) {
        util.log("Init watcher on table `lobby`");

        // Row inserted
        if (oldRow === null) {

            // Select bot
            selectFreeBot(function (bot) {
                bot.free = false; // set bot as busy
                util.log('[Bot #' + bot.id + '] ' + 'Started');
                var lobbyId = newRow.fields.id,
                    lobbyName = 'Lobby_' + lobbyId,
                    lobbyPassword = generatePassword();
                bot.currentLobby.id = lobbyId;
                // Save lobby name and password to database, and status 'in process'
                mysql.query('update `lobby` set `name` = "' + lobbyName + '", ' +
                            '`password` = "' + lobbyPassword + '", ' +
                            'status = 2 ' +
                            'where `id` = ' + lobbyId, function (error, results, fields) {
                    if (error) throw error;

                    // Leave previous lobby for this bot and start new
                    bot.Dota2.leavePracticeLobby(function(err, data){
                        if(!err) {
                            //bot.Dota2.abandonCurrentGame(function(err, body){});

                            var createLobby = function(prop){
                                // Create lobby with properties
                                bot.Dota2.createPracticeLobby(properties, function(err, data){
                                    if (err) {
                                        bot.free = true;
                                        bot.currentLobby.id = null;
                                        util.log('[Bot #' + bot.id + '] ' + err + ' - ' + JSON.stringify(data));
                                    } else {
                                        util.log('[Bot #' + bot.id + '] ' + 'Lobby created');

                                        // For some reason the bot automatically joins the first slot. Kick him.
                                        bot.Dota2.practiceLobbyKickFromTeam(bot.Dota2.AccountID);

                                        // Select steam-id's from database
                                        mysql.query('select u.`steam-id` as stid ' +
                                            'from `lobby_user` lu ' +
                                            'join `user` u on u.`id` = lu.`user_id` ' +
                                            'where lu.`lobby_id` = ' + lobbyId, function (error, results, fields){
                                            if (error)
                                                throw error;

                                            // Send invites
                                            util.log('[Bot #' + bot.id + '] ' + 'Inviting users..');
                                            for(var i = 0; i < results.length; i++){
                                                bot.Dota2.inviteToLobby(results[i].stid);
                                            }
                                        });

                                        // Lobby timeout
                                        if(global.config.lobby_timeout !== 'none') {
                                            setTimeout(function () {

                                                // Save lobby status 'timeout lobby'
                                                mysql.query('update lobby set status = 3 ' +
                                                            'where id = ' + lobbyId, function(err, res){
                                                    if(err) throw err;

                                                    // Leave lobby
                                                    bot.Dota2.leavePracticeLobby(function (err, body) {
                                                        bot.free = true;
                                                        bot.currentLobby.id = null;
                                                        util.log('[Bot #' + bot.id + '] ' + 'Bot leave lobby by timeout');
                                                        bot.Dota2.abandonCurrentGame(function (err, body) {
                                                        });
                                                    });
                                                });
                                            }, global.config.lobby_timeout * 1000);
                                        }
                                    }
                                });
                            };

                            if(newRow.fields.settings_id){

                                // Select lobby settings from database (leagueid)
                                mysql.query('select * from settings ' +
                                            'where id = ' + newRow.fields.settings_id, function (error, results, fields) {
                                    if (error) throw error;
                                    var properties = {
                                        leagueid: results.fields.leagueid
                                    };
                                    properties.game_name = lobbyName;
                                    properties.pass_key = lobbyPassword;
                                    createLobby(properties);
                                });
                            } else {

                                // Default settings
                                var properties = global.config.lobby_preset;
                                properties.game_name = lobbyName;
                                properties.pass_key = lobbyPassword;
                                createLobby(properties);
                            }
                        } else {
                            bot.free = true;
                            bot.currentLobby.id = null;
                        }
                    });
                });
            });
        }
    });

    // Create database watcher for table 'bot'
    mysqlEventWatcher.add(global.config.mysql.database + '.bot', function (oldRow, newRow, event){
        util.log("Init watcher on table `bot`");

        // Row inserted
        if (oldRow === null) {
            initBot(newRow.fields);
        }
    });
};

// Stop database watcher
var stopDBWatcher = function () {
    mysqlEventWatcher.stop();
};

// Start app
(function init(){
    util.log("START");
    mysql.connect();

    // Init bots
    mysql.query('select * from bot', function (error, results, fields){
        if (error) throw error;
        util.log('Found ' + results.length + ' bots accounts');
        for(var i = 0; i < results.length; i++){
            initBot(results[i]);
        }

        // Start database watcher
        setTimeout(startDBWatcher, 5000);
    });


})();
process.on('SIGINT', function() {
    // Bots Steam logout
    setTimeout(function(){
        for(var i = 0; i < bots.length; i++){
            bots[i].Dota2.exit();

        }
    }, 1000);
    setTimeout(function(){
        for(var i = 0; i < bots.length; i++){
            bots[i].steamClient.disconnect();
        }
    }, 3000);
    setTimeout(function(){
        stopDBWatcher();
        mysql.end();
    }, 4000);
    setTimeout(function(){
        util.log("STOP");
        process.exit();
    }, 5000);
});

// Function generate password for lobby
var generatePassword = function(){
    var code = "";
    // Omitted characters that can look like others
    var possibleChars = ["B", "D", "E", "F", "G", "H", "C", "J", "K", "L", "M", "N", "P", "Q",
                         "R", "S", "T", "W", "X", "Y","Z", "2", "3", "5", "6", "7", "8", "9"];
    for (var i = 0; i < 20; i++) {
        code += possibleChars[Math.floor(Math.random() * possibleChars.length)];
    }
    return code;
};