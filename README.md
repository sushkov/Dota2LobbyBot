# Dota2LobbyBot

Dota2 game bot for creating lobbies with invitation users and match starting.  

Bot use mysql watcher plugin (based on [ZongJi](https://github.com/nevill/zongji)) and [node-dota2](https://github.com/Arcana/node-dota2) plugin for Dota 2, and use mysql database.  
Third-party application inserts rows in database table, node application listen database and create lobby with invitation users. The application can run several bot accounts (settings from the database) and create bot after account settings insertion to database.

## Mysql watcher enable
  * Enable MySQL binlog in `my.cnf`, restart MySQL server after making the changes.
    > From [MySQL 5.6](https://dev.mysql.com/doc/refman/5.6/en/replication-options-binary-log.html), binlog checksum is enabled by default. Zongji can work with it, but it doesn't really verify it.
  
    ```
    # Must be unique integer from 1-2^32
    server-id = 1
    # Row format required for ZongJi
    binlog_format = row
    # Directory must exist. This path works for Linux. Other OS may require
    # different path.
    log_bin = /var/log/mysql/mysql-bin.log
  
    binlog_do_db     = dota2botdb  # Optional, limit which databases to log
    expire_logs_days = 10          # Optional, purge old logs
    max_binlog_size  = 100M        # Optional, limit log size
    ```
  * Create an account with replication privileges, e.g. given privileges to account `root` (or any account that you use to read binary logs)
  
    ```sql
    GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT ON *.* TO 'root'@'localhost'
    ```
## Installation
* Requires Node.js v4.4.5+
```bash
  $ npm install
  $ npm run bot
```
