require './mastodon.rb'

Mastodon.new(ARGV, File.basename(__FILE__)).run