require 'optparse'

class Option
  def initialize(argv=ARGV, mode)
    o = OptionParser.new

    @opts = {
      service: "handon.club",
      account_id: 1,
      hagetter_id: 0,
      hashtag: "",
      max_id: 0,
      favourite_threshold: ["user.rb", "local_timeline.rb"].include?("mode") ? 2 : 0,
      accept_unlisted_toot: false,
      check_permission: false,
      limit: 20,
      num_of_page: 10,
      debug: false,
    }

    @restricts = {
      "user.rb":           {required: ["s", "i"], mandatory: ["m", "f", "u", "p", "n", "v"]},
      "hashtag.rb":        {required: ["s", "t"], mandatory: ["m", "f", "p", "l", "n", "v"]},
      "local_timeline.rb": {required: ["s"],      mandatory: ["m", "f", "p", "l", "n", "v"]},
      "bookmark.rb":       {required: ["s"],      mandatory: ["m", "f", "u", "p", "l", "n", "v"]},
      "favourite.rb":      {required: ["s"],      mandatory: ["m", "f", "u", "p", "l", "n", "v"]},
      "hagetter.rb":       {required: ["g"],      mandatory: ["f", "u", "p"]},
    }
    @restricts.each { |key, value| @restricts[key][:available] = value[:required] + value[:mandatory] }

    o.on('-s', '--service STRING', 'Specify service hostname') { |v| @opts[:service] = v }                                                                            if @restricts[mode.to_sym][:available].include?("s")
    o.on('-i', '--account-id VALUE', 'Specify :id for account') { |v| @opts[:account_id] = v.to_i }                                                                   if @restricts[mode.to_sym][:available].include?("i")
    o.on('-g', '--hagetter-id VALUE', 'Specify hagetter status id') { |v| @opts[:hagetter_id] = v.to_i }                                                              if @restricts[mode.to_sym][:available].include?("g")
    o.on('-t', '--hashtag STRING', 'Specify hashtag (except #)') { |v| @opts[:hashtag] = v }                                                                          if @restricts[mode.to_sym][:available].include?("t")
    o.on('-m', '--max-id VALUE', 'Specify initial max_id'){ |v| @opts[:max_id] = v.to_i }                                                                             if @restricts[mode.to_sym][:available].include?("m")
    o.on('-f', '--favourite-threshold VALUE', "Specify threshold of favourite (default: #{@opts[:favourite_threshold]})"){ |v| @opts[:favourite_threshold] = v.to_i } if @restricts[mode.to_sym][:available].include?("f")
    o.on('-u', '--with-unlisted-toot', 'Accept not only public but also unlisted toot (default: false)'){ |v| @opts[:accept_unlisted_toot] = v }                      if @restricts[mode.to_sym][:available].include?("u")
    o.on('-p', '--enable-permission-check', 'Check permission .json file (default: false)'){ |v| @opts[:check_permission] = v }                                       if @restricts[mode.to_sym][:available].include?("p")
    o.on('-l', '--limit VALUE', 'Specify limit of a number of contents per API page (default: 20)'){ |v| @opts[:limit] = v.to_i }                                     if @restricts[mode.to_sym][:available].include?("l")
    o.on('-n', '--number VALUE', 'Specify page count for API call (default: 10)'){ |v| @opts[:num_of_page] = v.to_i }                                                 if @restricts[mode.to_sym][:available].include?("n")
    o.on('-v', '--verbose', 'Set verbose mode (default: false)'){ |v| @opts[:debug] = v }                                                                             if @restricts[mode.to_sym][:available].include?("v")

    begin
      o.parse(argv)
    rescue => error
      STDERR.puts "指定できない引数が含まれています。無視して実行します..."
    end
  end

  def get
    @opts
  end

  def command(filename, max_id)
    c = "ruby bin/mastodon/#{filename}"
    c = "#{c} -s #{@opts[:service]}"             if @restricts[filename.to_sym][:available].include?("s")
    c = "#{c} -i #{@opts[:account_id]}"          if @restricts[filename.to_sym][:available].include?("i")
    c = "#{c} -g #{@opts[:hagetter_id]}"         if @restricts[filename.to_sym][:available].include?("g")
    c = "#{c} -t #{@opts[:hashtag]}"             if @restricts[filename.to_sym][:available].include?("t")
    c = "#{c} -m #{max_id}"                      if @restricts[filename.to_sym][:available].include?("m")
    c = "#{c} -f #{@opts[:favourite_threshold]}" if @restricts[filename.to_sym][:available].include?("f")
    c = "#{c} -u"                                if @restricts[filename.to_sym][:available].include?("u") && @opts[:accept_unlisted_toot]
    c = "#{c} -p"                                if @restricts[filename.to_sym][:available].include?("p") && @opts[:check_permission]
    c = "#{c} -l #{@opts[:limit]}"               if @restricts[filename.to_sym][:available].include?("l")
    c = "#{c} -n #{@opts[:num_of_page]}"         if @restricts[filename.to_sym][:available].include?("n")
    c = "#{c} -v"                                if @restricts[filename.to_sym][:available].include?("v") && @opts[:debug]
    c
  end
end


