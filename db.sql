-- Database structure

create table settings(
    id int not null auto_increment,
    leagueid int,
    primary key (id)
);

create table lobby (
    id bigint not null auto_increment,
    name text,
    password text,
    settings_id int,
    status numeric(1) default null,
    primary key(id),
    foreign key (settings_id) references settings(id)
);

create table user (
    id bigint not null auto_increment,
    `steam-id` text,
    primary key(id)
);

create table lobby_user (
    id bigint not null auto_increment,
    lobby_id bigint,
    user_id bigint,
    primary key(id),
    foreign key (lobby_id) references lobby(id),
    foreign key (user_id) references user(id)
);

create table bot(
    id int not null auto_increment,
    steam_name text,
    steam_user text,
    steam_pass text,
    steam_guard_code text not null,
    two_factor_code text not null,
    primary key (id)
);