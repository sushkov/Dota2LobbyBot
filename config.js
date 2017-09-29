var config = {};

var dota2 = require("dota2");

// Database settings
config.mysql = {
    host:     '',
    user:     '',
    password: '',
    database: ''
};

config.lobby_timeout = 120; // Lobby bot timeout (seconds, or value 'none')
config.match_users = 10; // Persons in lobby for start match (max 10)
config.remaining_before_match = 10; // Seconds remaining before start match

// Default lobby settings
config.lobby_preset = {
    server_region: dota2.ServerRegion.EUROPE
};

module.exports = config;