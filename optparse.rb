require 'optparse'

class Option
  def initialize(argv=ARGV)
    o = OptionParser.new

    @opts = {
      service: "handon.club",
      account_id: 1,
      max_id: 0,
      accept_unlisted_toot: false,
      num_of_page: 10,
    }

    o.on('-s', '--service VALUE', 'Specify service hostname') { |v| @opts[:service] = v }
    o.on('-i', '--account-id VALUE', 'Specify :id for account') { |v| @opts[:account_id] = v.to_i }
    o.on('-m', '--max-id VALUE', 'Specify initial max_id'){ |v| @opts[:max_id] = v.to_i }
    o.on('-u', '--with-unlisted-toot', 'Accept not only public but also unlisted toot (default: false)'){ |v| @opts[:accept_unlisted_toot] = v }
    o.on('-n', '--number VALUE', 'Specify page count for API call (default: 10)'){ |v| @opts[:num_of_page] = v.to_i }
    o.parse(argv)
  end

  def get
    @opts
  end
end


